from __future__ import annotations

import logging
from collections.abc import MutableMapping
from pathlib import Path
from profile import AgentProfile, load_profile_catalog
from typing import Any

import chromadb
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from clients.chromadb import (
    ChromaKnowledgeBase,
    KnowledgeBaseConfig,
    build_knowledge_base_config,
    with_collection,
)
from recording.config import RecordingConfig, build_recording_config  # noqa: F401

logger = logging.getLogger(__name__)

USERDATA_VAD = "vad"
USERDATA_TURN_DETECTOR = "turn_detector"
USERDATA_PROFILE_CATALOG = "profile_catalog"
USERDATA_KB_BASE_CONFIG = "kb_base_config"
USERDATA_RECORDING_CONFIG = "recording_config"
USERDATA_CHROMA_CLIENTS = "chroma_clients"
USERDATA_CHROMA_COLLECTIONS = "chroma_collections"
USERDATA_MEMORY_CLIENT = "memory_client"


def get_profile_catalog(
    userdata: MutableMapping[str, Any],
    *,
    fallback_path: Path,
) -> dict[str, AgentProfile]:
    catalog = userdata.get(USERDATA_PROFILE_CATALOG)
    if isinstance(catalog, dict):
        return catalog
    catalog = load_profile_catalog(fallback_path)
    userdata[USERDATA_PROFILE_CATALOG] = catalog
    return catalog


def get_kb_base_config(userdata: MutableMapping[str, Any]) -> KnowledgeBaseConfig:
    config = userdata.get(USERDATA_KB_BASE_CONFIG)
    if isinstance(config, KnowledgeBaseConfig):
        return config
    config = build_knowledge_base_config()
    userdata[USERDATA_KB_BASE_CONFIG] = config
    return config


def get_recording_config(userdata: MutableMapping[str, Any]) -> RecordingConfig:
    config = userdata.get(USERDATA_RECORDING_CONFIG)
    if isinstance(config, RecordingConfig):
        return config
    config = build_recording_config()
    userdata[USERDATA_RECORDING_CONFIG] = config
    return config


def get_prewarmed_vad(userdata: MutableMapping[str, Any]) -> Any | None:
    return userdata.get(USERDATA_VAD)


def get_prewarmed_turn_detector(userdata: MutableMapping[str, Any]) -> Any | None:
    return userdata.get(USERDATA_TURN_DETECTOR)


def get_or_create_turn_detector(userdata: MutableMapping[str, Any]) -> Any:
    turn_detector = userdata.get(USERDATA_TURN_DETECTOR)
    if turn_detector is None:
        turn_detector = MultilingualModel()
        userdata[USERDATA_TURN_DETECTOR] = turn_detector
    return turn_detector


def _chroma_client_key(config: KnowledgeBaseConfig) -> tuple[str, str, str]:
    return (config.api_key, config.tenant, config.database)


def _get_chroma_client(
    userdata: MutableMapping[str, Any],
    config: KnowledgeBaseConfig,
) -> Any:
    clients = userdata.setdefault(USERDATA_CHROMA_CLIENTS, {})
    key = _chroma_client_key(config)
    if key not in clients:
        logger.info(
            "[KB] Connecting cached ChromaDB client: tenant=%r database=%r",
            config.tenant,
            config.database,
        )
        clients[key] = chromadb.CloudClient(
            api_key=config.api_key,
            tenant=config.tenant,
            database=config.database,
        )
    return clients[key]


def build_cached_knowledge_base(
    userdata: MutableMapping[str, Any],
    *,
    base_config: KnowledgeBaseConfig,
    collection_name: str,
) -> ChromaKnowledgeBase:
    config = with_collection(base_config, collection_name)
    if not config.available:
        return ChromaKnowledgeBase(config)

    client = _get_chroma_client(userdata, config)
    collections = userdata.setdefault(USERDATA_CHROMA_COLLECTIONS, {})
    collection_key = (*_chroma_client_key(config), collection_name)
    if collection_key not in collections:
        logger.info("[KB] Getting cached ChromaDB collection: %r", collection_name)
        collections[collection_key] = client.get_collection(collection_name)

    return ChromaKnowledgeBase(
        config,
        client=client,
        collection=collections[collection_key],
    )


def get_memory_client(userdata: MutableMapping[str, Any]) -> Any:
    client = userdata.get(USERDATA_MEMORY_CLIENT)
    if client is not None:
        return client

    from clients.mem0 import AsyncMemoryClient

    client = AsyncMemoryClient()
    userdata[USERDATA_MEMORY_CLIENT] = client
    return client
