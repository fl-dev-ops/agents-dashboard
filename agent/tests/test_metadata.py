from __future__ import annotations

import json

from metadata import resolve_session_metadata


def test_resolve_session_metadata_prefers_agent_id_source() -> None:
    room_raw = json.dumps({"user_id": "room-user"})
    job_raw = json.dumps({"agent_id": "diagnostic", "interaction_mode": "auto"})

    raw, metadata = resolve_session_metadata(job_raw, room_raw)

    assert raw == job_raw
    assert metadata == {"agent_id": "diagnostic", "interaction_mode": "auto"}


def test_resolve_session_metadata_falls_back_to_room_metadata() -> None:
    room_raw = json.dumps({"agent_id": "job"})

    raw, metadata = resolve_session_metadata(None, room_raw)

    assert raw == room_raw
    assert metadata == {"agent_id": "job"}


def test_resolve_session_metadata_ignores_invalid_and_empty_sources() -> None:
    raw, metadata = resolve_session_metadata(None, "not-json", "[]")

    assert raw is None
    assert metadata == {}
