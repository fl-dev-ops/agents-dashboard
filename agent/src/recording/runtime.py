from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from livekit import api
from livekit.protocol.egress import (
    EgressStatus,
    EncodedFileOutput,
    EncodedFileType,
    ListEgressRequest,
    RoomCompositeEgressRequest,
    S3Upload,
    StopEgressRequest,
)

from clients.aws_s3 import (
    build_audio_s3_key,
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

TERMINAL_STATUSES = {
    EgressStatus.EGRESS_COMPLETE,
    EgressStatus.EGRESS_FAILED,
    EgressStatus.EGRESS_ABORTED,
    EgressStatus.EGRESS_LIMIT_REACHED,
}


@dataclass(frozen=True)
class RecordingStartState:
    recording_session_id: str | None = None
    audio_url: str | None = None
    audio_s3_key: str | None = None
    egress_id: str | None = None
    video_url: str | None = None
    video_s3_key: str | None = None
    video_egress_id: str | None = None


@dataclass(frozen=True)
class FinalizeRecordingRequest:
    config: RecordingConfig
    lk_api: api.LiveKitAPI
    egress_id: str | None
    agent_type: str
    agent_name: str
    room_name: str
    audio_url: str
    audio_s3_key: str
    report_dict: dict[str, Any]
    session_id: str | None = None
    resolved_user_id: str | None = None
    participant_identity: str | None = None
    phone_number: str | None = None
    metrics_events: list[dict[str, Any]] | None = None
    usage_summary: dict[str, Any] | None = None
    webhook_url: str | None = None
    send_webhook: bool = True
    video_egress_id: str | None = None
    video_url: str | None = None
    video_s3_key: str | None = None


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
    room_sid: str | None = None,
    resolved_user_id: str | None = None,
    participant_identity: str | None = None,
    phone_number: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> tuple[str | None, str, str, str | None, str | None, str, str | None]:
    now = datetime.now(timezone.utc)
    audio_s3_key = build_audio_s3_key(agent_type, room_name, config.s3_base_prefix, now)
    audio_url = build_s3_url(
        config.s3_bucket, audio_s3_key, config.s3_region, config.s3_endpoint
    )
    video_s3_key = build_video_s3_key(agent_type, room_name, config.s3_base_prefix, now)
    video_url = build_s3_url(
        config.s3_bucket, video_s3_key, config.s3_region, config.s3_endpoint
    )

    audio_egress_id: str | None = None
    video_egress_id: str | None = None

    s3_upload = _build_s3_upload(config)

    async def _start_audio_egress() -> None:
        nonlocal audio_egress_id
        try:
            file_output = EncodedFileOutput(
                file_type=EncodedFileType.MP3,
                filepath=audio_s3_key,
                s3=s3_upload,
            )
            egress_info = await lk_api.egress.start_room_composite_egress(
                RoomCompositeEgressRequest(
                    room_name=room_name,
                    audio_only=True,
                    file=file_output,
                )
            )
            audio_egress_id = egress_info.egress_id
            logger.info("Started audio egress %s for room %s", audio_egress_id, room_name)
        except Exception as e:
            logger.error("Failed to start audio egress for room %s: %s", room_name, e)

    async def _start_video_egress() -> None:
        nonlocal video_egress_id
        try:
            file_output = EncodedFileOutput(
                file_type=EncodedFileType.MP4,
                filepath=video_s3_key,
                s3=s3_upload,
            )
            egress_info = await lk_api.egress.start_room_composite_egress(
                RoomCompositeEgressRequest(
                    room_name=room_name,
                    audio_only=False,
                    file=file_output,
                )
            )
            video_egress_id = egress_info.egress_id
            logger.info("Started video egress %s for room %s", video_egress_id, room_name)
        except Exception as e:
            logger.error("Failed to start video egress for room %s: %s", room_name, e)

    await asyncio.gather(_start_audio_egress(), _start_video_egress())

    session_id: str | None = None
    if config.database_url:
        try:
            session_id = await insert_session(
                agent_type=agent_type,
                agent_name=agent_name,
                livekit_room_name=room_name,
                livekit_room_sid=room_sid,
                egress_id=audio_egress_id,
                resolved_user_id=resolved_user_id,
                participant_identity=participant_identity,
                phone_number=phone_number,
                started_at=now,
                audio_url=audio_url,
                audio_s3_key=audio_s3_key,
                video_url=video_url,
                video_s3_key=video_s3_key,
                video_egress_id=video_egress_id,
                metadata=metadata,
            )
        except Exception as e:
            logger.error("Failed to insert session row: %s", e)

    return (
        session_id,
        audio_url,
        audio_s3_key,
        audio_egress_id,
        video_url,
        video_s3_key,
        video_egress_id,
    )


async def start_recording_for_session(
    *,
    config: RecordingConfig,
    lk_api: api.LiveKitAPI,
    agent_type: str,
    agent_name: str,
    room_name: str,
    resolved_user_id: str | None,
    participant_identity: str | None,
    phone_number: str | None,
    metadata: dict[str, object],
) -> RecordingStartState:
    if not config.enabled:
        return RecordingStartState()

    try:
        if config.database_url:
            try:
                await init_pool(config.database_url)
            except Exception as e:
                logger.error("Failed to initialize recording DB: %s", e)
        (
            recording_session_id,
            audio_url,
            audio_s3_key,
            egress_id,
            video_url,
            video_s3_key,
            video_egress_id,
        ) = await start_recording(
            config=config,
            lk_api=lk_api,
            agent_type=agent_type,
            agent_name=agent_name,
            room_name=room_name,
            resolved_user_id=resolved_user_id,
            participant_identity=participant_identity,
            phone_number=phone_number,
            metadata=metadata,
        )
        return RecordingStartState(
            recording_session_id=recording_session_id,
            audio_url=audio_url,
            audio_s3_key=audio_s3_key,
            egress_id=egress_id,
            video_url=video_url,
            video_s3_key=video_s3_key,
            video_egress_id=video_egress_id,
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
    egress_status_str: str | None,
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
    return {
        "agent_type": req.agent_type,
        "agent_name": req.agent_name,
        "room_name": req.room_name,
        "room_id": req.report_dict.get("room_id"),
        "job_id": req.report_dict.get("job_id"),
        "status": final_status,
        "egress_id": req.egress_id,
        "egress_status": egress_status_str,
        "audio_url": req.audio_url,
        "audio_s3_key": req.audio_s3_key,
        "video_url": req.video_url,
        "video_s3_key": req.video_s3_key,
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

    egress_status_str: str | None = None
    final_status = "COMPLETED"

    egress_tasks = []
    if req.egress_id:
        egress_tasks.append(
            _stop_and_poll_egress(
                lk_api=req.lk_api,
                egress_id=req.egress_id,
                timeout=req.config.egress_poll_timeout_seconds,
                label="audio",
            )
        )
    if req.video_egress_id:
        egress_tasks.append(
            _stop_and_poll_egress(
                lk_api=req.lk_api,
                egress_id=req.video_egress_id,
                timeout=req.config.egress_poll_timeout_seconds,
                label="video",
            )
        )

    if egress_tasks:
        egress_results = await asyncio.gather(*egress_tasks)
        audio_result = egress_results[0] if req.egress_id else None
        if audio_result is not None:
            egress_status_str, audio_failed, audio_timed_out = audio_result
            if audio_failed:
                final_status = "EGRESS_FAILED"
            elif audio_timed_out:
                final_status = "FINALIZE_TIMEOUT"

        if req.video_egress_id:
            video_result = egress_results[-1]
            _, video_failed, _ = video_result
            if video_failed:
                logger.warning(
                    "Video egress %s failed/aborted, continuing with audio-only recording",
                    req.video_egress_id,
                )

    duration_ms: int | None = None
    started_at = req.report_dict.get("started_at")
    if started_at:
        duration = req.report_dict.get("duration")
        duration_ms = (
            int(duration * 1000)
            if duration
            else int((now.timestamp() - started_at) * 1000)
        )

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
        egress_id=req.egress_id,
        egress_status_str=egress_status_str,
        resolved_user_id=req.resolved_user_id,
        participant_identity=req.participant_identity,
        phone_number=req.phone_number,
        metrics_events=req.metrics_events,
        usage_summary=req.usage_summary,
    )

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
                video_url=req.video_url,
                video_s3_key=req.video_s3_key,
                egress_status=egress_status_str,
                status=final_status,
            )
        except Exception as e:
            logger.error("Failed to update session to %s: %s", final_status, e)

    if req.send_webhook and final_status == "COMPLETED" and transcript_url:
        target_url = req.webhook_url or req.config.webhook_url
        if target_url:
            await post_webhook(
                target_url,
                _build_webhook_payload(
                    req=req,
                    egress_status_str=egress_status_str,
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

    logger.info(
        "Recording finalized for room %s: status=%s, egress=%s, transcript=%s, metrics=%s, verbose=%s",
        req.room_name,
        final_status,
        egress_status_str,
        "yes" if transcript_url else "no",
        "yes" if metrics_url else "no",
        "yes" if verbose_url else "no",
    )

    return {
        "status": final_status,
        "egress_status": egress_status_str,
        "audio_url": req.audio_url,
        "audio_s3_key": req.audio_s3_key,
        "video_url": req.video_url,
        "video_s3_key": req.video_s3_key,
        "transcript_url": transcript_url,
        "transcript_s3_key": transcript_s3_key,
        "metrics_url": metrics_url,
        "metrics_s3_key": metrics_s3_key,
        "verbose_url": verbose_url,
        "verbose_s3_key": verbose_s3_key,
        "duration_ms": duration_ms,
        "transcript": transcript_data,
    }
