from __future__ import annotations

import pytest


def test_chromadb_build_where_filter_combines_filters() -> None:
    from clients.chromadb import build_where_filter

    assert build_where_filter(
        {
            "content_type": "diagnostic_question",
            "difficulty_level": ["easy", "medium"],
            "band": "3",
        }
    ) == {
        "$and": [
            {"content_type": "diagnostic_question"},
            {"difficulty_level": {"$in": ["easy", "medium"]}},
            {"band": 3},
        ]
    }


@pytest.mark.asyncio
async def test_memory_tools_expose_recall_and_save() -> None:
    from tools.memory import build_memory_tools

    tools = build_memory_tools(object(), "user-1")

    assert [tool.id for tool in tools] == ["recall_memory", "save_memory"]


def test_runtime_resources_caches_chroma_collection(monkeypatch) -> None:
    import runtime.cache as runtime_cache
    from clients.chromadb import KnowledgeBaseConfig

    calls: list[str] = []

    class FakeClient:
        def get_collection(self, name: str):
            calls.append(name)
            return {"name": name}

    monkeypatch.setattr(runtime_cache, "_get_chroma_client", lambda *_: FakeClient())
    userdata: dict = {}
    config = KnowledgeBaseConfig(
        enabled=True,
        api_key="key",
        tenant="tenant",
        database="db",
        default_limit=10,
    )

    first = runtime_cache.build_cached_knowledge_base(
        userdata,
        base_config=config,
        collection_name="questions",
    )
    second = runtime_cache.build_cached_knowledge_base(
        userdata,
        base_config=config,
        collection_name="questions",
    )

    assert first._collection is second._collection
    assert calls == ["questions"]
