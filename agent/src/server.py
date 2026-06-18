from __future__ import annotations

import asyncio
import logging
import os
import resource
import time
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer
from livekit.agents.beta.tools import EndCallTool

from clients.langfuse import flush_langfuse, setup_langfuse
from identity import (
    resolve_phone_number_from_call_context,
    resolve_user_id_from_call_context,
    resolve_user_id_from_room_metadata,
)
from metadata import (
    build_recording_metadata,
    extract_session_config,
    parse_room_metadata,
    resolve_interaction_mode,
)
from prompt import build_prompt_context, load_prompt, render_prompt
from ptt import register_push_to_talk_rpcs
from recording.config import RecordingConfig
from recording.runtime import (
    FinalizeRecordingRequest,
    RecordingStartState,
    finalize_recording,
    start_recording_for_session,
)
from runtime.cache import (
    get_or_create_turn_detector,
    get_prewarmed_turn_detector,
    get_prewarmed_vad,
    get_profile_catalog,
    get_recording_config,
)
from runtime.prewarm import prewarm_runtime_resources
from session import InteractionMode, build_agent_session
from session_helpers import attach_metrics_logging, build_room_options
from tools.builder import build_profile_tools
from unified_agent import UnifiedAgent
from watchdog import cancel_idle_room_watchdog, register_idle_room_watchdog

logger = logging.getLogger("intervoo_agent")

CALLER_LOOKUP_TIMEOUT_SECONDS = 5
DEFAULT_AGENT_NAME = "intervoo-agent"
MAX_CONCURRENT_SESSIONS = 10


def _get_process_rss_mb() -> float:
    """Return the process's peak resident set size in MB."""
    # ru_maxrss is bytes on macOS, KB on Linux
    ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if ru > 10_000_000:
        # Likely bytes (macOS)
        return ru / (1024 * 1024)
    # Likely KB (Linux)
    return ru / 1024


END_CALL_EXTRA_DESCRIPTION = (
    "Only end the call when the user clearly indicates the conversation is complete."
)
END_CALL_INSTRUCTIONS = "Thanks for practicing with me today. Goodbye."

APP_DIR = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE_CONFIG_PATH = APP_DIR / "config" / "agents.json"

load_dotenv(str(APP_DIR / ".env.local"))
load_dotenv(str(APP_DIR / ".env"))


def _resolve_profile_config_path() -> Path:
    override = os.getenv("AGENT_PROFILE_CONFIG")
    if override:
        return Path(override)
    return DEFAULT_PROFILE_CONFIG_PATH


REGISTERED_AGENT_NAME = os.getenv("AGENT_NAME", DEFAULT_AGENT_NAME)


@dataclass(frozen=True)
class SessionState:
    profile_id: str
    agent_type: str
    room_name: str
    resolved_user_id: str | None
    participant_identity: str | None
    phone_number: str | None
    webhook_url: str | None
    recording_config: RecordingConfig | None = None
    recording_session_id: str | None = None
    egress_id: str | None = None
    audio_url: str | None = None
    audio_s3_key: str | None = None
    video_egress_id: str | None = None
    video_url: str | None = None
    video_s3_key: str | None = None
    memory_start_snapshot: object = None


_sessions: dict[str, SessionState] = {}


class StartupTimer:
    def __init__(self, room_name: str) -> None:
        self.room_name = room_name
        self._last = time.perf_counter()

    def mark(self, phase: str) -> None:
        now = time.perf_counter()
        logger.info(
            "startup_phase phase=%s room=%s elapsed_ms=%.2f",
            phase,
            self.room_name,
            (now - self._last) * 1000,
        )
        self._last = now


def prewarm(proc: agents.JobProcess) -> None:
    prewarm_runtime_resources(
        proc,
        profile_config_path=_resolve_profile_config_path(),
    )
    # TODO(livekit-agents>=1.6): Remove tracemalloc if the 1.5.x memory leak
    # is confirmed fixed.  ~5-10% memory overhead; safe to disable once stable.
    # Tracks: https://github.com/livekit/agents/issues/5590
    #         https://github.com/livekit/agents/pull/5591
    import tracemalloc

    tracemalloc.start()
    proc.userdata["memory_trace_enabled"] = True
    logger.info("tracemalloc started")


def _pick_call_participant(ctx: agents.JobContext) -> rtc.RemoteParticipant | None:
    participants = list(ctx.room.remote_participants.values())
    for participant in participants:
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            return participant
    return participants[0] if participants else None


async def _resolve_call_state(
    ctx: agents.JobContext,
    initial_user_id: str,
) -> tuple[str, str | None, str | None, dict[str, str] | None]:
    participant = _pick_call_participant(ctx)
    if participant is None:
        try:
            participant = await asyncio.wait_for(
                ctx.wait_for_participant(),
                timeout=CALLER_LOOKUP_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            participant = None

    participant_identity = participant.identity if participant else None
    participant_attributes = (
        dict(participant.attributes.items())
        if participant and participant.attributes
        else None
    )
    resolved_user_id = resolve_user_id_from_call_context(
        current_user_id=initial_user_id,
        participant_identity=participant_identity,
        participant_attributes=participant_attributes,
        room_name=ctx.room.name,
    )
    phone_number = resolve_phone_number_from_call_context(
        participant_identity=participant_identity,
        participant_attributes=participant_attributes,
        room_name=ctx.room.name,
    )
    return resolved_user_id, participant_identity, phone_number, participant_attributes


def _compute_worker_load(current_server: AgentServer) -> float:
    return 1.0 if len(current_server.active_jobs) >= MAX_CONCURRENT_SESSIONS else 0.0


server = AgentServer(
    setup_fnc=prewarm,
    shutdown_process_timeout=60,
    session_end_timeout=300,
    load_fnc=_compute_worker_load,
    load_threshold=0.5,
    job_memory_warn_mb=2048,
    job_memory_limit_mb=4096,
)


async def on_session_end(ctx: agents.JobContext) -> None:
    cancel_idle_room_watchdog(ctx.room.name)

    state = _sessions.pop(ctx.room.name, None)
    if state is None:
        logger.info("No session state found for room %s", ctx.room.name)
        flush_langfuse()
        return

    report_dict: dict = {}
    try:
        report = ctx.make_session_report()
        report_dict = report.to_dict()
        report_dict.setdefault("started_at", report.started_at)
        report_dict.setdefault("duration", report.duration)
    except Exception as e:
        logger.warning("Failed to create session report: %s", e)

    recording_result: dict[str, object] | None = None

    if state.recording_config is not None:
        try:
            recording_result = await finalize_recording(
                FinalizeRecordingRequest(
                    config=state.recording_config,
                    lk_api=ctx.api,
                    egress_id=state.egress_id,
                    agent_type=state.agent_type,
                    agent_name=state.agent_type,
                    room_name=state.room_name,
                    audio_url=state.audio_url or "",
                    audio_s3_key=state.audio_s3_key or "",
                    report_dict=report_dict,
                    session_id=state.recording_session_id,
                    resolved_user_id=state.resolved_user_id,
                    participant_identity=state.participant_identity,
                    phone_number=state.phone_number,
                    webhook_url=state.webhook_url,
                    send_webhook=False,
                    video_egress_id=state.video_egress_id,
                    video_url=state.video_url,
                    video_s3_key=state.video_s3_key,
                )
            )
        except Exception as e:
            logger.error("Recording finalization failed: %s", e)

    if state.webhook_url:
        try:
            from clients.webhook import post_webhook
            from recording.transcript import normalize_session_report

            transcript_data = (
                recording_result.get("transcript") if recording_result else None
            )
            if transcript_data is None:
                try:
                    transcript_data = normalize_session_report(
                        report_dict,
                        agent_type=state.agent_type,
                        agent_name=state.agent_type,
                        resolved_user_id=state.resolved_user_id,
                        participant_identity=state.participant_identity,
                        phone_number=state.phone_number,
                    )
                except Exception:
                    pass

            payload = {
                "agent_id": state.profile_id,
                "agent_type": state.agent_type,
                "room_name": state.room_name,
                "audio_url": recording_result.get("audio_url")
                if recording_result
                else state.audio_url,
                "video_url": recording_result.get("video_url")
                if recording_result
                else state.video_url,
                "transcript_url": recording_result.get("transcript_url")
                if recording_result
                else None,
                "verbose_url": recording_result.get("verbose_url")
                if recording_result
                else None,
                "transcript": transcript_data,
                "duration_ms": recording_result.get("duration_ms")
                if recording_result
                else None,
                "status": recording_result.get("status")
                if recording_result
                else "COMPLETED",
            }
            if recording_result:
                for url_key in (
                    "audio_url",
                    "transcript_url",
                    "metrics_url",
                    "verbose_url",
                ):
                    url = recording_result.get(url_key)
                    if isinstance(url, str) and url:
                        logger.info("%s", url)
            await post_webhook(state.webhook_url, payload)
        except Exception as e:
            logger.error("Failed to post completion webhook: %s", e)

    import tracemalloc

    end_snapshot = tracemalloc.take_snapshot()
    top_stats = end_snapshot.compare_to(
        state.memory_start_snapshot,  # type: ignore[arg-type]
        "lineno",
    )[:10]
    for stat in top_stats:
        logger.info("memory_diff room=%s %s", ctx.room.name, stat)

    logger.info(
        "session_end_memory room=%s rss_mb=%.1f",
        ctx.room.name,
        _get_process_rss_mb(),
    )
    flush_langfuse()


@server.rtc_session(agent_name=REGISTERED_AGENT_NAME, on_session_end=on_session_end)
async def entrypoint(ctx: agents.JobContext) -> None:
    timer = StartupTimer(ctx.room.name)
    userdata = ctx.proc.userdata
    room_metadata = ctx.job.room.metadata or ctx.room.metadata
    metadata = parse_room_metadata(room_metadata)

    logger.info(
        "session_start_memory room=%s rss_mb=%.1f",
        ctx.room.name,
        _get_process_rss_mb(),
    )

    import tracemalloc

    memory_start_snapshot = tracemalloc.take_snapshot()
    logger.info("tracemalloc start snapshot taken for room %s", ctx.room.name)
    profile_catalog = get_profile_catalog(
        userdata,
        fallback_path=_resolve_profile_config_path(),
    )

    from profile import ProfileError, pick_profile

    try:
        profile = pick_profile(profile_catalog, metadata)
    except ProfileError as e:
        logger.error("Cannot resolve agent profile: %s", e)
        return

    mode = resolve_interaction_mode(metadata)
    session_config = extract_session_config(metadata)
    recording_metadata = build_recording_metadata(metadata, mode, profile)
    timer.mark("metadata_profile")

    await ctx.connect()
    timer.mark("ctx_connect")
    register_idle_room_watchdog(ctx)

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        logger.info("User disconnected: %s", participant.identity)

    initial_user_id = resolve_user_id_from_room_metadata(room_metadata)
    (
        resolved_user_id,
        participant_identity,
        phone_number,
        _participant_attributes,
    ) = await _resolve_call_state(ctx, initial_user_id)
    timer.mark("participant_lookup")

    try:
        setup_langfuse(
            metadata={
                "langfuse.session.id": ctx.room.name,
                "langfuse.user.id": resolved_user_id or "anonymous",
                "agent_id": profile.id,
                "agent_name": profile.agent_type,
                "job_id": ctx.job.id,
                "mode": mode.value,
            }
        )
    except Exception as e:
        logger.warning("Langfuse setup failed: %s", e)

    try:
        prompt_template = load_prompt(profile.prompt_url)
    except Exception as e:
        logger.error("Failed to load prompt for agent_id=%s: %s", profile.id, e)
        return

    prompt_context = build_prompt_context(metadata)
    agent_instructions = render_prompt(prompt_template, context=prompt_context)
    timer.mark("prompt_render")

    rec_cfg = get_recording_config(userdata)
    recording_task: asyncio.Task[RecordingStartState] | None = None
    if rec_cfg.enabled:
        recording_task = asyncio.create_task(
            start_recording_for_session(
                config=rec_cfg,
                lk_api=ctx.api,
                agent_type=profile.agent_type,
                agent_name=profile.agent_type,
                room_name=ctx.room.name,
                resolved_user_id=resolved_user_id,
                participant_identity=participant_identity,
                phone_number=phone_number,
                metadata=recording_metadata,
            ),
            name=f"recording-start:{ctx.room.name}",
        )

    end_call_tool = (
        EndCallTool(
            extra_description=END_CALL_EXTRA_DESCRIPTION,
            delete_room=True,
            end_instructions=END_CALL_INSTRUCTIONS,
        )
        if profile.end_call_enabled
        else None
    )
    tools, extra_instructions = build_profile_tools(
        profile=profile,
        userdata=userdata,
        user_id=resolved_user_id,
        room=ctx.room,
        end_call_tool=end_call_tool,
    )
    if extra_instructions:
        agent_instructions = f"{agent_instructions}\n\n{extra_instructions}"
    timer.mark("tool_build")

    agent = UnifiedAgent(
        instructions=agent_instructions,
        tools=tools,
        initial_reply=profile.initial_reply,
        participant_identity=participant_identity,
        room_name=ctx.room.name,
    )

    session = build_agent_session(
        tts_speaker=profile.voice_speaker,
        tts_dict_id=profile.voice_dict_id,
        mode=mode,
        session_config=session_config,
        vad=get_prewarmed_vad(userdata),
        turn_detector=(
            get_or_create_turn_detector(userdata)
            if mode is InteractionMode.AUTO
            else get_prewarmed_turn_detector(userdata)
        ),
    )
    attach_metrics_logging(session)
    timer.mark("session_build")

    webhook_url_raw = metadata.get("webhook_url")
    webhook_url = (
        webhook_url_raw.strip()
        if isinstance(webhook_url_raw, str) and webhook_url_raw.strip()
        else None
    )

    recording_start = (
        await recording_task if recording_task is not None else RecordingStartState()
    )
    timer.mark("recording_start")

    _sessions[ctx.room.name] = SessionState(
        profile_id=profile.id,
        agent_type=profile.agent_type,
        room_name=ctx.room.name,
        resolved_user_id=resolved_user_id,
        participant_identity=participant_identity,
        phone_number=phone_number,
        webhook_url=webhook_url,
        recording_config=rec_cfg if rec_cfg.enabled else None,
        recording_session_id=recording_start.recording_session_id,
        egress_id=recording_start.egress_id,
        audio_url=recording_start.audio_url,
        audio_s3_key=recording_start.audio_s3_key,
        video_egress_id=recording_start.video_egress_id,
        video_url=recording_start.video_url,
        video_s3_key=recording_start.video_s3_key,
        memory_start_snapshot=memory_start_snapshot,
    )

    if mode is InteractionMode.PTT:
        await session.start(
            room=ctx.room,
            agent=agent,
            room_options=build_room_options(),
        )
        session.input.set_audio_enabled(False)
        register_push_to_talk_rpcs(ctx, session)
        logger.info("Unified agent PTT session started")
    else:
        await session.start(
            room=ctx.room,
            agent=agent,
            room_options=build_room_options(),
        )
        logger.info("Unified agent auto session started")
    timer.mark("session_start")


def main() -> None:
    agents.cli.run_app(server)


if __name__ == "__main__":
    main()
