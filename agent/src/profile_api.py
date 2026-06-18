from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from profile import AgentProfile, ProfileError
from typing import Any

logger = logging.getLogger(__name__)

DASHBOARD_API_URL = os.getenv("DASHBOARD_API_URL", "").rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("DASHBOARD_API_TIMEOUT_SECONDS", "10"))
CACHE_TTL_SECONDS = float(os.getenv("DASHBOARD_PROFILE_CACHE_TTL_SECONDS", "300"))

_cache: dict[str, tuple[float, AgentProfile]] = {}


def is_api_mode() -> bool:
    return bool(DASHBOARD_API_URL)


def _string_field(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ProfileError(f"Dashboard profile field {field!r} must be a non-empty string")
    return value.strip()


def _optional_string_field(payload: Mapping[str, Any], field: str) -> str | None:
    value = payload.get(field)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _bool_field(payload: Mapping[str, Any], field: str) -> bool:
    value = payload.get(field)
    return value if isinstance(value, bool) else False


def _profile_from_payload(payload: Mapping[str, Any]) -> AgentProfile:
    agent_id = _string_field(payload, "id")
    kb_shape = _optional_string_field(payload, "kb_shape") or "simple"
    if kb_shape not in ("simple", "diagnostic"):
        raise ProfileError(
            f"Dashboard profile field 'kb_shape' must be 'simple' or 'diagnostic', got {kb_shape!r}"
        )
    return AgentProfile(
        id=agent_id,
        agent_type=agent_id,
        prompt=_string_field(payload, "prompt"),
        initial_reply=_string_field(payload, "initial_reply"),
        voice_speaker=_string_field(payload, "voice_speaker"),
        voice_dict_id=_optional_string_field(payload, "voice_dict_id"),
        end_call_enabled=_bool_field(payload, "end_call_enabled"),
        kb_collection=_optional_string_field(payload, "kb_collection"),
        kb_shape=kb_shape,
        memory_enabled=_bool_field(payload, "memory_enabled"),
        model=_string_field(payload, "model"),
        recording_type=_optional_string_field(payload, "recording_type") or "off",
        webhook_url=_optional_string_field(payload, "webhook_url") or "",
    )


def fetch_profile_from_api(agent_id: str) -> AgentProfile:
    normalized_agent_id = agent_id.strip() if isinstance(agent_id, str) else ""
    if not normalized_agent_id:
        raise ProfileError("agent_id must be a non-empty string")
    if not DASHBOARD_API_URL:
        raise ProfileError("DASHBOARD_API_URL is not configured")

    encoded_agent_id = urllib.parse.quote(normalized_agent_id, safe="")
    url = f"{DASHBOARD_API_URL}/api/agents/{encoded_agent_id}"

    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise ProfileError(f"Agent {normalized_agent_id!r} not found in dashboard") from e
        raise ProfileError(
            f"Dashboard API returned HTTP {e.code} for agent {normalized_agent_id!r}"
        ) from e
    except json.JSONDecodeError as e:
        raise ProfileError(
            f"Dashboard API returned invalid JSON for agent {normalized_agent_id!r}"
        ) from e
    except Exception as e:
        raise ProfileError(
            f"Failed to fetch agent {normalized_agent_id!r} from dashboard: {e}"
        ) from e

    if not isinstance(payload, Mapping):
        raise ProfileError("Dashboard profile response must be an object")
    return _profile_from_payload(payload)


def fetch_profile(agent_id: str) -> AgentProfile:
    now = time.monotonic()
    cached = _cache.get(agent_id)
    if cached is not None:
        cached_at, profile = cached
        if now - cached_at < CACHE_TTL_SECONDS:
            logger.debug("Using cached dashboard profile for agent_id=%s", agent_id)
            return profile

    profile = fetch_profile_from_api(agent_id)
    _cache[agent_id] = (now, profile)
    return profile


def invalidate_cache(agent_id: str | None = None) -> None:
    if agent_id is None:
        _cache.clear()
    else:
        _cache.pop(agent_id, None)
