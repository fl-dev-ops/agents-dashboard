from __future__ import annotations

from clients import webhook


class _Response:
    status = 200

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: object) -> None:
        return None


async def test_post_webhook_sends_authorization_header(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(req, timeout):
        captured["authorization"] = req.get_header("Authorization")
        captured["timeout"] = timeout
        return _Response()

    monkeypatch.setattr(webhook.request, "urlopen", fake_urlopen)

    await webhook.post_webhook(
        "https://example.com/hook",
        {"ok": True},
        authorization="Bearer test-secret",
    )

    assert captured == {"authorization": "Bearer test-secret", "timeout": 30}
