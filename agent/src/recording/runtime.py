from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from livekit import api
from livekit.protocol.egress import (
    EgressStatus,
    EncodedFileOutput,
    EncodedFileType,
    ImageCodec,
    ImageOutput,
    ListEgressRequest,
    RoomCompositeEgressRequest,
    S3Upload,
    StopEgressRequest,
)

from clients.aws_s3 import (
    build_audio_s3_key,
    build_frames_s3_key,
    build_s3_url,
    build_video_s3_key,
)
from clients.webhook import post_webhook
from recording.artifacts import upload_all_artifacts
from recording.config import RecordingConfig
from recording.db import (
    init_pool,
    insert_session,
    update_session_completed,
    update_session_finalizing,
)

logger = logging.getLogger(__name__)

MAX_EGRESS_COUNT = 3

TERMINAL_STATUSES = {
    EgressStatus.EGRESS_COMPLETE,
    EgressStatus.EGRESS_FAILED,
    EgressStatus.EGRESS_ABORTED,
    EgressStatus.EGRESS_LIMIT_REACHED,
}


@dataclass(frozen=True)
class EgressEntry:
    """A single active egress stream."""

    type: str  # "audio" | "video" | "frames"
    egress_id: str | None = None
    s3_key: str | None = None
    url: str | None = None


@dataclass(frozen=True)
class RecordingStartState:
    recording_session_id: str | None = None
    egresses: tuple[EgressEntry, ...] = ()


@dataclass(frozen=True)
class FinalizeRecordingRequest:
    config: RecordingConfig
    lk_api: api.LiveKitAPI
    agent_type: str
    agent_name: str
    room_name: str
    report_dict: dict[str, Any]
    egress_entries: tuple[EgressEntry, ...] = ()
    session_id: str | None = None
    resolved_user_id: str | None = None
    participant_identity: str | None = None
    phone_number: str | None = None
    metrics_events: list[dict[str, Any]] | None = None
    usage_summary: dict[str, Any] | None = None
    webhook_url: str | None = None
    send_webhook: bool = True


def _build_s3_upload(config: RecordingConfig) -> S3Upload:
    kwargs: dict[str, Any] = {
        "access_key": config.s3_access_key,
        "secret": config.s3_secret_key,
        "region": config.s3_region,
        "bucket": config.s3_bucket,
    }
    if config.s3_endpoint:
        kwargs["endpoint"] = config.s3_endpoint
    if config.s3_force_path_style:
        kwargs["force_path_style"] = True
    return S3Upload(**kwargs)


async def start_recording(
    *,
    config: RecordingConfig,
    lk_api: api.LiveKitAPI,
    agent_type: str,
    agent_name: str,
    room_name: str,
    egress_configs: list[dict[str, Any]],
    room_sid: str | None = None,
    resolved_user_id: str | None = None,
    participant_identity: str | None = None,
    phone_number: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> tuple[str | None, tuple[EgressEntry, ...]]:
    """Start egress streams based on agent config.

    Returns (session_id, egress_entries).
    """
    now = datetime.now(timezone.utc)
    s3_upload = _build_s3_upload(config)

    # Build egress start tasks based on configured types
    egress_tasks: list[tuple[str, asyncio.Task[EgressEntry | None]]] = []

    for cfg in egress_configs:
        egress_type = cfg.get("type", "")
        if egress_type == "audio":
            s3_key = build_audio_s3_key(agent_type, room_name, config.s3_base_prefix, now)
            url = build_s3_url(config.s3_bucket, s3_key, config.s3_region, config.s3_endpoint)

            async def _start_audio() -> EgressEntry | None:
                try:
                    file_output = EncodedFileOutput(
                        file_type=EncodedFileType.MP3,
                        filepath=s3_key,
                        s3=s3_upload,
                    )
                    egress_info = await lk_api.egress.start_room_composite_egress(
                        RoomCompositeEgressRequest(
                            room_name=room_name,
                            audio_only=True,
                            file_outputs=[file_output],
                        )
                    )
                    logger.info("Started audio egress %s for room %s", egress_info.egress_id, room_name)
                    return EgressEntry(type="audio", egress_id=egress_info.egress_id, s3_key=s3_key, url=url)
                except Exception as e:
                    logger.error("Failed to start audio egress for room %s: %s", room_name, e)
                    return None

            egress_tasks.append(("audio", asyncio.create_task(_start_audio())))

        elif egress_type == "video":
            s3_key = build_video_s3_key(agent_type, room_name, config.s3_base_prefix, now)
            url = build_s3_url(config.s3_bucket, s3_key, config.s3_region, config.s3_endpoint)

            async def _start_video() -> EgressEntry | None:
                try:
                    file_output = EncodedFileOutput(
                        file_type=EncodedFileType.MP4,
                        filepath=s3_key,
                        s3=s3_upload,
                    )
                    egress_info = await lk_api.egress.start_room_composite_egress(
                        RoomCompositeEgressRequest(
                            room_name=room_name,
                            file_outputs=[file_output],
                        )
                    )
                    logger.info("Started video egress %s for room %s", egress_info.egress_id, room_name)
                    return EgressEntry(type="video", egress_id=egress_info.egress_id, s3_key=s3_key, url=url)
                except Exception as e:
                    logger.error("Failed to start video egress for room %s: %s", room_name, e)
                    return None

            egress_tasks.append(("video", asyncio.create_task(_start_video())))

        elif egress_type == "frames":
            frame_interval = int(cfg.get("frameIntervalSec", 5))
            frames_prefix = build_frames_s3_key(agent_type, room_name, config.s3_base_prefix, now)

            async def _start_frames() -> EgressEntry | None:
                try:
                    image_output = ImageOutput(
                        capture_interval=frame_interval,
                        filename_prefix="frame",
                        image_codec=ImageCodec.JPEG,
                        s3=s3_upload,
                        filepath=frames_prefix,
                    )
                    egress_info = await lk_api.egress.start_room_composite_egress(
                        RoomCompositeEgressRequest(
                            room_name=room_name,
                            image_outputs=[image_output],
                        )
                    )
                    logger.info(
                        "Started frames egress %s for room %s (interval=%ds)",
                        egress_info.egress_id,
                        room_name,
                        frame_interval,
                    )
                    # Frames URL is the S3 prefix directory
                    frames_url = build_s3_url(
                        config.s3_bucket, frames_prefix, config.s3_region, config.s3_endpoint
                    )
                    return EgressEntry(type="frames", egress_id=egress_info.egress_id, s3_key=frames_prefix, url=frames_url)
                except Exception as e:
                    logger.error("Failed to start frames egress for room %s: %s", room_name, e)
                    return None

            egress_tasks.append(("frames", asyncio.create_task(_start_frames())))

    # Run all egress starts concurrently
    results = await asyncio.gather(*(task for _, task in egress_tasks))
    entries = [result for result in results if result is not None]

    # Insert session row if DB is configured
    session_id: str | None = None
    if config.s3_bucket:
        # Collect URLs/keys for DB insertion
        audio_entry = next((e for e in entries if e.type == "audio"), None)
        video_entry = next((e for e in entries if e.type == "video"), None)
        frames_entry = next((e for e in entries if e.type == "frames"), None)

        try:
            session_id = await insert_session(
                agent_type=agent_type,
                agent_name=agent_name,
                livekit_room_name=room_name,
                livekit_room_sid=room_sid,
                egress_id=audio_entry.egress_id if audio_entry else None,
                resolved_user_id=resolved_user_id,
                participant_identity=participant_identity,
                phone_number=phone_number,
                started_at=now,
                audio_url=audio_entry.url if audio_entry else None,
                audio_s3_key=audio_entry.s3_key if audio_entry else None,
                video_url=video_entry.url if video_entry else None,
                video_s3_key=video_entry.s3_key if video_entry else None,
                video_egress_id=video_entry.egress_id if video_entry else None,
                metadata=metadata,
            )
        except Exception as e:
            logger.error("Failed to insert session row: %s", e)

    return session_id, tuple(entries)


async def start_recording_for_session(
    *,
    config: RecordingConfig,
    lk_api: api.LiveKitAPI,
    agent_type: str,
    agent_name: str,
    room_name: str,
    egress_configs: list[dict[str, Any]],
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
    metadata: dict[str, object],
) -> RecordingStartState:
    if not egress_configs:
        return RecordingStartState()

    if not config.available:
        logger.warning("S3 not configured, skipping egress for room %s", room_name)
        return RecordingStartState()

    try:
        session_id, entries = await start_recording(
            config=config,
            lk_api=lk_api,
            agent_type=agent_type,
            agent_name=agent_name,
            room_name=room_name,
            egress_configs=egress_configs,
            resolved_user_id=resolved_user_id,
            participant_identity=participant_identity,
            phone_number=phone_number,
            metadata=metadata,
        )
        return RecordingStartState(
            recording_session_id=session_id,
            egresses=entries,
        )
    except Exception as e:
        logger.error("Failed to initialize recording: %s", e)
        return RecordingStartState()


async def _stop_and_poll_egress(
    *,
    lk_api: api.LiveKitAPI,
    egress_id: str,
    timeout: int,
    label: str,
) -> tuple[str | None, bool, bool]:
    try:
        await lk_api.egress.stop_egress(StopEgressRequest(egress_id=egress_id))
        logger.info("Sent stop_egress for %s %s", label, egress_id)
    except Exception as e:
        logger.warning("Failed to stop %s egress %s: %s", label, egress_id, e)

    egress_status_str: str | None = None
    failed = False
    timed_out = False
    poll_interval = 2
    elapsed = 0
    while elapsed < timeout:
        try:
            resp = await lk_api.egress.list_egress(
                ListEgressRequest(egress_id=egress_id)
            )
            if resp.items:
                info = resp.items[0]
                egress_status_str = EgressStatus.Name(info.status)
                if info.status in TERMINAL_STATUSES:
                    failed = info.status in (
                        EgressStatus.EGRESS_FAILED,
                        EgressStatus.EGRESS_ABORTED,
                    )
                    break
        except Exception as e:
            logger.warning("Error polling %s egress %s: %s", label, egress_id, e)
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
    else:
        timed_out = True
        logger.warning(
            "%s egress %s did not reach terminal state within %ds",
            label.title(),
            egress_id,
            timeout,
        )

    return egress_status_str, failed, timed_out


def _build_webhook_payload(
    *,
    req: FinalizeRecordingRequest,
    egress_results: dict[str, str | None],
    final_status: str,
    transcript_data: dict[str, Any] | None,
    transcript_url: str | None,
    transcript_s3_key: str | None,
    metrics_url: str | None,
    metrics_s3_key: str | None,
    verbose_url: str | None,
    verbose_s3_key: str | None,
    duration_ms: int | None,
) -> dict[str, Any]:
    # Collect per-type URLs from egress entries
    audio_entry = next((e for e in req.egress_entries if e.type == "audio"), None)
    video_entry = next((e for e in req.egress_entries if e.type == "video"), None)
    frames_entry = next((e for e in req.egress_entries if e.type == "frames"), None)

    return {
        "agent_type": req.agent_type,
        "agent_name": req.agent_name,
        "room_name": req.room_name,
        "room_id": req.report_dict.get("room_id"),
        "job_id": req.report_dict.get("job_id"),
        "status": final_status,
        "egress_status": egress_results.get("audio") or egress_results.get("video"),
        "audio_url": audio_entry.url if audio_entry else None,
        "audio_s3_key": audio_entry.s3_key if audio_entry else None,
        "video_url": video_entry.url if video_entry else None,
        "video_s3_key": video_entry.s3_key if video_entry else None,
        "frames_url": frames_entry.url if frames_entry else None,
        "frames_s3_key": frames_entry.s3_key if frames_entry else None,
        "transcript_url": transcript_url,
        "transcript_s3_key": transcript_s3_key,
        "metrics_url": metrics_url,
        "metrics_s3_key": metrics_s3_key,
        "verbose_url": verbose_url,
        "verbose_s3_key": verbose_s3_key,
        "duration_ms": duration_ms,
        "started_at": transcript_data.get("session", {}).get("started_at")
        if transcript_data
        else None,
        "ended_at": transcript_data.get("session", {}).get("ended_at")
        if transcript_data
        else None,
        "resolved_user_id": req.resolved_user_id,
        "participant_identity": req.participant_identity,
        "phone_number": req.phone_number,
        "transcript": transcript_data,
    }


async def finalize_recording(req: FinalizeRecordingRequest) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    if req.session_id:
        try:
            await update_session_finalizing(req.session_id)
        except Exception as e:
            logger.warning("Failed to mark session finalizing: %s", e)

    # Stop all active egresses concurrently
    egress_results: dict[str, str | None] = {}
    final_status = "COMPLETED"

    stop_tasks = []
    for entry in req.egress_entries:
        if entry.egress_id:
            stop_tasks.append(
                (entry.type, _stop_and_poll_egress(
                    lk_api=req.lk_api,
                    egress_id=entry.egress_id,
                    timeout=req.config.egress_poll_timeout_seconds,
                    label=entry.type,
                ))
            )

    if stop_tasks:
        results = await asyncio.gather(*(task for _, task in stop_tasks))
        for (egress_type, _), result in zip(stop_tasks, results):
            status_str, failed, timed_out = result
            egress_results[egress_type] = status_str
            if failed:
                final_status = "EGRESS_FAILED"
            elif timed_out:
                final_status = "FINALIZE_TIMEOUT"

    duration_ms: int | None = None
    started_at = req.report_dict.get("started_at")
    if started_at:
        duration = req.report_dict.get("duration")
        duration_ms = (
            int(duration * 1000)
            if duration
            else int((now.timestamp() - started_at) * 1000)
        )

    # Use first egress_id for artifact upload (transcript/metrics are per-session, not per-egress)
    primary_egress_id = req.egress_entries[0].egress_id if req.egress_entries else None

    (
        transcript_data,
        transcript_url,
        transcript_s3_key,
        metrics_url,
        metrics_s3_key,
        verbose_url,
        verbose_s3_key,
    ) = await upload_all_artifacts(
        config=req.config,
        agent_type=req.agent_type,
        agent_name=req.agent_name,
        room_name=req.room_name,
        now=now,
        report_dict=req.report_dict,
        egress_id=primary_egress_id,
        egress_status_str=egress_results.get("audio") or egress_results.get("video"),
        resolved_user_id=req.resolved_user_id,
        participant_identity=req.participant_identity,
        phone_number=req.phone_number,
        metrics_events=req.metrics_events,
        usage_summary=req.usage_summary,
    )

    # Collect per-type URLs for DB update
    audio_entry = next((e for e in req.egress_entries if e.type == "audio"), None)
    video_entry = next((e for e in req.egress_entries if e.type == "video"), None)

    if req.session_id:
        try:
            await update_session_completed(
                req.session_id,
                ended_at=now,
                duration_ms=duration_ms,
                transcript_url=transcript_url,
                transcript_s3_key=transcript_s3_key,
                metrics_url=metrics_url,
                metrics_s3_key=metrics_s3_key,
                verbose_url=verbose_url,
                verbose_s3_key=verbose_s3_key,
                video_url=video_entry.url if video_entry else None,
                video_s3_key=video_entry.s3_key if video_entry else None,
                egress_status=egress_results.get("audio") or egress_results.get("video"),
                status=final_status,
            )
        except Exception as e:
            logger.error("Failed to update session to %s: %s", final_status, e)

    if req.send_webhook and final_status == "COMPLETED" and transcript_url:
        target_url = req.webhook_url
        if target_url:
            await post_webhook(
                target_url,
                _build_webhook_payload(
                    req=req,
                    egress_results=egress_results,
                    final_status=final_status,
                    transcript_data=transcript_data,
                    transcript_url=transcript_url,
                    transcript_s3_key=transcript_s3_key,
                    metrics_url=metrics_url,
                    metrics_s3_key=metrics_s3_key,
                    verbose_url=verbose_url,
                    verbose_s3_key=verbose_s3_key,
                    duration_ms=duration_ms,
                ),
            )

    egress_types = [e.type for e in req.egress_entries]
    logger.info(
        "Recording finalized for room %s: status=%s, egresses=%s, transcript=%s, metrics=%s, verbose=%s",
        req.room_name,
        final_status,
        egress_types,
        "yes" if transcript_url else "no",
        "yes" if metrics_url else "no",
        "yes" if verbose_url else "no",
    )

    return {
        "status": final_status,
        "egress_results": egress_results,
        "audio_url": audio_entry.url if audio_entry else None,
        "audio_s3_key": audio_entry.s3_key if audio_entry else None,
        "video_url": video_entry.url if video_entry else None,
        "video_s3_key": video_entry.s3_key if video_entry else None,
        "transcript_url": transcript_url,
        "transcript_s3_key": transcript_s3_key,
        "metrics_url": metrics_url,
        "metrics_s3_key": metrics_s3_key,
        "verbose_url": verbose_url,
        "verbose_s3_key": verbose_s3_key,
        "duration_ms": duration_ms,
        "transcript": transcript_data,
    }
