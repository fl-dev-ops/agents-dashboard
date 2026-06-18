from __future__ import annotations

import logging
from profile import AgentProfile
from typing import Any

from livekit.agents.beta.tools import EndCallTool

from clients.chromadb import ChromaKnowledgeBase
from runtime.cache import (
    build_cached_knowledge_base,
    get_kb_base_config,
    get_memory_client,
)
from tools.knowledge_base import build_kb_tool
from tools.memory import build_memory_tools

logger = logging.getLogger(__name__)

MEMORY_TOOL_INSTRUCTIONS = (
    "Memory tools are available. Use recall_memory only when past context would "
    "materially help the conversation. Use save_memory only for stable facts, "
    "preferences, goals, skills, or outcomes that should help future conversations. "
    "Do not call memory tools for routine greetings or every user turn."
)


def build_knowledge_base_for_profile(
    profile: AgentProfile,
    userdata: dict[str, Any],
) -> ChromaKnowledgeBase | None:
    kb_base_config = get_kb_base_config(userdata)
    if not profile.kb_collection or not kb_base_config.enabled:
        return None
    return build_cached_knowledge_base(
        userdata,
        base_config=kb_base_config,
        collection_name=profile.kb_collection,
    )


def build_profile_tools(
    *,
    profile: AgentProfile,
    userdata: dict[str, Any],
    user_id: str | None,
    room: Any | None,
    end_call_tool: EndCallTool | None,
) -> tuple[list[Any], str]:
    tools: list[Any] = []
    extra_instructions = ""

    if profile.end_call_enabled and end_call_tool is not None:
        tools.append(end_call_tool)

    kb = build_knowledge_base_for_profile(profile, userdata)
    if kb is not None:
        kb_tools = build_kb_tool(
            profile.kb_shape,
            kb,
            room=room if profile.kb_shape == "diagnostic" else None,
        )
        if isinstance(kb_tools, tuple):
            tools.extend(kb_tools)
        else:
            tools.append(kb_tools)

    if profile.memory_enabled:
        try:
            memory_client = get_memory_client(userdata)
            tools.extend(build_memory_tools(memory_client, user_id))
            extra_instructions = MEMORY_TOOL_INSTRUCTIONS
        except Exception as e:
            logger.warning("Failed to initialize mem0 client: %s", e)

    return tools, extra_instructions
