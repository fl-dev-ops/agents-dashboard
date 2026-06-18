from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from clients.aws_s3 import (
    build_metrics_s3_key,
    build_transcript_s3_key,
    build_verbose_s3_key,
    upload_metrics_json_async,
    upload_transcript_json_async,
    upload_verbose_json_async,
)
from recording.config import RecordingConfig
from recording.transcript import (
    normalize_metrics_payload,
    normalize_session_report,
    normalize_verbose_payload,
)

logger = logging.getLogger(__name__)


async def upload_transcript_artifact(
    *,
    config: RecordingConfig,
    agent_type: str,
    agent_name: str,
    room_name: str,
    now: datetime,
    report_dict: dict[str, Any],
    egress_id: str | None,
    egress_status_str: str | None,
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
) -> tuple[dict[str, Any] | None, str | None, str | None]:
    transcript_data = normalize_session_report(
        report_dict,
        agent_type=agent_type,
        agent_name=agent_name,
        egress_id=egress_id,
        egress_status=egress_status_str,
        resolved_user_id=resolved_user_id,
        participant_identity=participant_identity,
        phone_number=phone_number,
    )
    transcript_s3_key = build_transcript_s3_key(
        agent_type, room_name, config.s3_base_prefix, now
    )
    transcript_url = await upload_transcript_json_async(
        config, transcript_s3_key, transcript_data
    )
    return transcript_data, transcript_url, transcript_s3_key


async def upload_metrics_artifact(
    *,
    config: RecordingConfig,
    agent_type: str,
    agent_name: str,
    room_name: str,
    now: datetime,
    report_dict: dict[str, Any],
    egress_id: str | None,
    egress_status_str: str | None,
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
    metrics_events: list[dict[str, Any]] | None,
    usage_summary: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    metrics_payload = normalize_metrics_payload(
        report_dict,
        agent_type=agent_type,
        agent_name=agent_name,
        egress_id=egress_id,
        egress_status=egress_status_str,
        resolved_user_id=resolved_user_id,
        participant_identity=participant_identity,
        phone_number=phone_number,
        events=metrics_events,
        usage_summary=usage_summary,
    )
    metrics_s3_key = build_metrics_s3_key(
        agent_type, room_name, config.s3_base_prefix, now
    )
    metrics_url = await upload_metrics_json_async(config, metrics_s3_key, metrics_payload)
    return metrics_url, metrics_s3_key


async def upload_verbose_artifact(
    *,
    config: RecordingConfig,
    agent_type: str,
    agent_name: str,
    room_name: str,
    now: datetime,
    report_dict: dict[str, Any],
    egress_id: str | None,
    egress_status_str: str | None,
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
) -> tuple[str | None, str | None]:
    verbose_payload = normalize_verbose_payload(
        report_dict,
        agent_type=agent_type,
        agent_name=agent_name,
        egress_id=egress_id,
        egress_status=egress_status_str,
        resolved_user_id=resolved_user_id,
        participant_identity=participant_identity,
        phone_number=phone_number,
    )
    verbose_s3_key = build_verbose_s3_key(
        agent_type, room_name, config.s3_base_prefix, now
    )
    verbose_url = await upload_verbose_json_async(config, verbose_s3_key, verbose_payload)
    return verbose_url, verbose_s3_key


async def upload_all_artifacts(
    *,
    config: RecordingConfig,
    agent_type: str,
    agent_name: str,
    room_name: str,
    now: datetime,
    report_dict: dict[str, Any],
    egress_id: str | None,
    egress_status_str: str | None,
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
    metrics_events: list[dict[str, Any]] | None = None,
    usage_summary: dict[str, Any] | None = None,
) -> tuple[
    dict[str, Any] | None,
    str | None,
    str | None,
    str | None,
    str | None,
    str | None,
    str | None,
]:
    results = await asyncio.gather(
        upload_transcript_artifact(
            config=config,
            agent_type=agent_type,
            agent_name=agent_name,
            room_name=room_name,
            now=now,
            report_dict=report_dict,
            egress_id=egress_id,
            egress_status_str=egress_status_str,
            resolved_user_id=resolved_user_id,
            participant_identity=participant_identity,
            phone_number=phone_number,
        ),
        upload_metrics_artifact(
            config=config,
            agent_type=agent_type,
            agent_name=agent_name,
            room_name=room_name,
            now=now,
            report_dict=report_dict,
            egress_id=egress_id,
            egress_status_str=egress_status_str,
            resolved_user_id=resolved_user_id,
            participant_identity=participant_identity,
            phone_number=phone_number,
            metrics_events=metrics_events,
            usage_summary=usage_summary,
        ),
        upload_verbose_artifact(
            config=config,
            agent_type=agent_type,
            agent_name=agent_name,
            room_name=room_name,
            now=now,
            report_dict=report_dict,
            egress_id=egress_id,
            egress_status_str=egress_status_str,
            resolved_user_id=resolved_user_id,
            participant_identity=participant_identity,
            phone_number=phone_number,
        ),
        return_exceptions=True,
    )

    transcript_result, metrics_result, verbose_result = results

    transcript_data: dict[str, Any] | None = None
    transcript_url: str | None = None
    transcript_s3_key: str | None = None
    metrics_url: str | None = None
    metrics_s3_key: str | None = None
    verbose_url: str | None = None
    verbose_s3_key: str | None = None

    if isinstance(transcript_result, Exception):
        logger.error("Failed to upload transcript: %s", transcript_result)
    else:
        transcript_data, transcript_url, transcript_s3_key = transcript_result

    if isinstance(metrics_result, Exception):
        logger.error("Failed to upload metrics: %s", metrics_result)
    else:
        metrics_url, metrics_s3_key = metrics_result

    if isinstance(verbose_result, Exception):
        logger.error("Failed to upload verbose report: %s", verbose_result)
    else:
        verbose_url, verbose_s3_key = verbose_result

    return (
        transcript_data,
        transcript_url,
        transcript_s3_key,
        metrics_url,
        metrics_s3_key,
        verbose_url,
        verbose_s3_key,
    )
