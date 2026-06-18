from __future__ import annotations

import logging
from pathlib import Path
from profile import load_profile_catalog

from livekit.agents import JobProcess
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from clients.chromadb import build_knowledge_base_config
from prompt import load_prompt
from recording.config import build_recording_config
from runtime.cache import (
    USERDATA_CHROMA_CLIENTS,
    USERDATA_CHROMA_COLLECTIONS,
    USERDATA_KB_BASE_CONFIG,
    USERDATA_PROFILE_CATALOG,
    USERDATA_RECORDING_CONFIG,
    USERDATA_TURN_DETECTOR,
    USERDATA_VAD,
    build_cached_knowledge_base,
)

logger = logging.getLogger(__name__)


def prewarm_runtime_resources(
    proc: JobProcess,
    *,
    profile_config_path: Path,
) -> None:
    userdata = proc.userdata
    userdata.setdefault(USERDATA_CHROMA_CLIENTS, {})
    userdata.setdefault(USERDATA_CHROMA_COLLECTIONS, {})

    userdata[USERDATA_VAD] = silero.VAD.load()
    try:
        userdata[USERDATA_TURN_DETECTOR] = MultilingualModel()
    except RuntimeError as e:
        logger.info("Turn detector prewarm deferred until job context: %s", e)

    profile_catalog = load_profile_catalog(profile_config_path)
    userdata[USERDATA_PROFILE_CATALOG] = profile_catalog
    kb_base_config = build_knowledge_base_config()
    userdata[USERDATA_KB_BASE_CONFIG] = kb_base_config
    userdata[USERDATA_RECORDING_CONFIG] = build_recording_config()

    for profile in profile_catalog.values():
        try:
            load_prompt(profile.prompt_url)
        except Exception as e:
            logger.warning(
                "Failed to prewarm prompt for agent_id=%s: %s",
                profile.id,
                e,
            )
        if profile.kb_collection and kb_base_config.enabled:
            try:
                kb = build_cached_knowledge_base(
                    userdata,
                    base_config=kb_base_config,
                    collection_name=profile.kb_collection,
                )
                kb.prewarm()
            except Exception as e:
                logger.warning(
                    "Failed to prewarm knowledge base for agent_id=%s: %s",
                    profile.id,
                    e,
                )

    logger.info(
        "Runtime resources prewarmed: profiles=%s",
        sorted(profile_catalog.keys()),
    )
