from __future__ import annotations

import logging

from livekit import agents, rtc
from livekit.agents import AgentSession

logger = logging.getLogger(__name__)


def register_push_to_talk_rpcs(
    ctx: agents.JobContext,
    session: AgentSession,
) -> None:
    @ctx.room.local_participant.register_rpc_method("start_turn")
    async def start_turn(data: rtc.RpcInvocationData) -> str:
        logger.info("start_turn RPC called by %s", data.caller_identity)
        session.interrupt()
        session.clear_user_turn()
        if getattr(session, "room_io", None) is not None:
            session.room_io.set_participant(data.caller_identity)
        session.input.set_audio_enabled(True)
        return "ok"

    @ctx.room.local_participant.register_rpc_method("end_turn")
    async def end_turn(data: rtc.RpcInvocationData) -> str:
        logger.info("end_turn RPC called by %s", data.caller_identity)
        session.input.set_audio_enabled(False)
        session.commit_user_turn(
            transcript_timeout=3.0,
            stt_flush_duration=0.5,
        )
        return "ok"

    @ctx.room.local_participant.register_rpc_method("cancel_turn")
    async def cancel_turn(data: rtc.RpcInvocationData) -> str:
        logger.info("cancel_turn RPC called by %s", data.caller_identity)
        session.input.set_audio_enabled(False)
        session.clear_user_turn()
        return "ok"

    @ctx.room.local_participant.register_rpc_method("pause_session")
    async def pause_session(data: rtc.RpcInvocationData) -> str:
        logger.info("pause_session RPC called by %s", data.caller_identity)
        session.interrupt()
        session.input.set_audio_enabled(False)
        return "ok"

    @ctx.room.local_participant.register_rpc_method("resume_session")
    async def resume_session(data: rtc.RpcInvocationData) -> str:
        logger.info("resume_session RPC called by %s", data.caller_identity)
        session.input.set_audio_enabled(True)
        return "ok"
