from __future__ import annotations

import logging
from typing import Any

from livekit import rtc
from livekit.agents import AgentSession, MetricsCollectedEvent, metrics, room_io
from livekit.plugins import noise_cancellation

logger = logging.getLogger(__name__)


def build_room_options() -> room_io.RoomOptions:
    return room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=lambda params: (
                noise_cancellation.BVCTelephony()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC()
            ),
        ),
        close_on_disconnect=False,
    )


def attach_metrics_logging(session: AgentSession) -> None:
    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent) -> None:
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    @session.on("function_tools_executed")
    def _on_tools_executed(ev: Any) -> None:
        for function_call, output in ev.zipped():
            logger.info(
                "Tool call executed: name=%s call_id=%s arguments=%s output=%s is_error=%s",
                function_call.name,
                function_call.call_id,
                function_call.arguments,
                output.output if output is not None else None,
                output.is_error if output is not None else None,
            )
