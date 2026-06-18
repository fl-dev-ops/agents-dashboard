from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any

from livekit.agents import AgentSession, TurnHandlingOptions
from livekit.plugins import openai, sarvam, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger(__name__)


# TODO(livekit-sarvam>=1.6): Remove these patches once the upstream plugin
# fixes idle WebSocket closes for long-running sessions.
#
# TTS pool patch — tracks PR #5704 (fixes issue #5681):
#   https://github.com/livekit/agents/pull/5704
#   https://github.com/livekit/agents/issues/5681
#
# STT heartbeat patch — no upstream PR yet.  The STT plugin creates its
# WebSocket without heartbeat=, causing close code 1006 after 60s idle.
# The framework auto-reconnects (retryable=True), but each reconnect
# causes a brief STT blackout.  File an upstream issue if this patch
# is still needed after the TTS PR merges.


def _patch_sarvam_tts_pool(tts: sarvam.TTS) -> None:
    """Patch the Sarvam TTS connection pool for long-running sessions.

    Sarvam's server closes idle WebSocket connections after 60 seconds.
    The plugin's pool defaults to max_session_duration=3600 with
    mark_refreshed_on_get=False, which can hand out stale connections
    if the keepalive ping fails for any reason.

    Shrink the pool duration below Sarvam's 60s cutoff and enable
    refresh-on-get so actively-used connections are never recycled
    mid-conversation.  This is a defense-in-depth measure alongside
    the plugin's built-in keepalive loop.
    """
    pool = getattr(tts, "_pool", None)
    if pool is None:
        logger.warning("Sarvam TTS: could not locate _pool, skipping patch")
        return
    pool._max_session_duration = 50
    pool._mark_refreshed_on_get = True
    logger.info(
        "Sarvam TTS: patched pool max_session_duration=50, mark_refreshed_on_get=True"
    )


def _patch_sarvam_stt_heartbeat(stt: sarvam.STT) -> None:
    """Inject protocol-level WebSocket PING frames into the Sarvam STT connection.

    The STT plugin creates its WebSocket without ``heartbeat=``, so aiohttp
    never sends protocol-level PINGs.  Sarvam's server closes idle connections
    after 60 s, which kills the STT stream during natural conversation pauses.

    The framework auto-reconnects (retryable=True), but each reconnect causes
    a brief STT interruption.  Adding heartbeat prevents the close in the
    first place.
    """
    session = getattr(stt, "_session", None)
    if session is None:
        logger.warning(
            "Sarvam STT: could not locate _session, skipping heartbeat patch"
        )
        return
    original_ws_connect = session.ws_connect

    async def _patched_ws_connect(*args: object, **kwargs: object) -> object:
        kwargs.setdefault("heartbeat", 20.0)
        return await original_ws_connect(*args, **kwargs)

    session.ws_connect = _patched_ws_connect  # type: ignore[assignment]
    logger.info("Sarvam STT: patched ws_connect with heartbeat=20.0")


DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.1"
DEFAULT_SARVAM_LANGUAGE = "en-IN"
DEFAULT_SARVAM_TTS_MODEL = "bulbul:v3"


class InteractionMode(str, Enum):
    AUTO = "auto"
    PTT = "ptt"


@dataclass(frozen=True)
class SessionConfig:
    voice: str | None = None
    speaking_speed: float | None = None
    dict_id: str | None = None


def build_agent_session(
    *,
    openrouter_model: str = DEFAULT_OPENROUTER_MODEL,
    tts_speaker: str,
    tts_dict_id: str | None,
    tts_model: str = DEFAULT_SARVAM_TTS_MODEL,
    mode: InteractionMode = InteractionMode.AUTO,
    session_config: SessionConfig | None = None,
    vad: Any | None = None,
    turn_detector: Any | None = None,
) -> AgentSession:
    effective_session_config = session_config or SessionConfig()

    stt = sarvam.STT(
        language=DEFAULT_SARVAM_LANGUAGE,
        model="saaras:v3",
        mode="transcribe",
    )
    _patch_sarvam_stt_heartbeat(stt)

    llm = openai.LLM.with_openrouter(model=openrouter_model)

    tts = sarvam.TTS(
        target_language_code=DEFAULT_SARVAM_LANGUAGE,
        model=tts_model,
        speaker=effective_session_config.voice or tts_speaker,
        pace=effective_session_config.speaking_speed or 1.0,
        temperature=0.6,
        enable_preprocessing=True,
        output_audio_bitrate="128k",
        min_buffer_size=50,
        max_chunk_length=150,
        dict_id=effective_session_config.dict_id or tts_dict_id,
    )
    _patch_sarvam_tts_pool(tts)

    if hasattr(tts, "prewarm"):
        tts.prewarm()

    if mode is InteractionMode.PTT:
        return AgentSession(
            stt=stt,
            llm=llm,
            tts=tts,
            turn_handling=TurnHandlingOptions(
                turn_detection="manual",
                interruption={
                    "mode": "adaptive",
                    "min_duration": 0.5,
                    "resume_false_interruption": True,
                },
            ),
            use_tts_aligned_transcript=True,
            preemptive_generation=False,
        )

    return AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad or silero.VAD.load(),
        turn_handling=TurnHandlingOptions(
            turn_detection=turn_detector or MultilingualModel(),
            endpointing={
                "mode": "dynamic",
                "min_delay": 1.5,
                "max_delay": 3.0,
            },
            interruption={
                "mode": "adaptive",
                "min_duration": 0.5,
                "resume_false_interruption": True,
            },
        ),
    )
