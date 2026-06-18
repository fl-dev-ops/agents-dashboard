from __future__ import annotations

import json
import logging
import math
from collections.abc import Mapping
from profile import AgentProfile

from session import InteractionMode, SessionConfig

logger = logging.getLogger(__name__)


def parse_room_metadata(metadata: str | None) -> dict[str, object]:
    if not metadata:
        return {}
    try:
        payload = json.loads(metadata)
    except json.JSONDecodeError:
        logger.warning("Room metadata is not valid JSON")
        return {}
    if isinstance(payload, dict):
        return payload
    logger.warning("Room metadata is not an object")
    return {}


def extract_session_config(metadata: Mapping[str, object] | None) -> SessionConfig:
    if not metadata:
        return SessionConfig()

    raw_config = metadata.get("config")
    if not isinstance(raw_config, Mapping):
        return SessionConfig()

    voice = raw_config.get("voice")
    normalized_voice = (
        voice.strip() if isinstance(voice, str) and voice.strip() else None
    )

    dict_id = raw_config.get("dict_id")
    normalized_dict_id = (
        dict_id.strip() if isinstance(dict_id, str) and dict_id.strip() else None
    )

    speaking_speed = raw_config.get("speaking_speed")
    normalized_speaking_speed: float | None = None
    if isinstance(speaking_speed, (int, float)) and math.isfinite(speaking_speed):
        normalized_speaking_speed = float(speaking_speed)
    elif isinstance(speaking_speed, str):
        try:
            parsed = float(speaking_speed)
        except ValueError:
            parsed = None
        if parsed is not None and math.isfinite(parsed):
            normalized_speaking_speed = parsed

    return SessionConfig(
        voice=normalized_voice,
        speaking_speed=normalized_speaking_speed,
        dict_id=normalized_dict_id,
    )


def resolve_interaction_mode(metadata: Mapping[str, object] | None) -> InteractionMode:
    if not metadata:
        return InteractionMode.AUTO
    interaction_mode = metadata.get("interaction_mode")
    if isinstance(interaction_mode, str):
        normalized = interaction_mode.strip().lower()
        if normalized == "ptt":
            return InteractionMode.PTT
        if normalized == "auto":
            return InteractionMode.AUTO
    return InteractionMode.AUTO


def build_recording_metadata(
    room_metadata: Mapping[str, object] | None,
    mode: InteractionMode,
    profile: AgentProfile,
) -> dict[str, object]:
    metadata = dict(room_metadata) if room_metadata else {}
    metadata["interaction_mode"] = mode.value
    metadata["agent_id"] = profile.id
    return metadata
