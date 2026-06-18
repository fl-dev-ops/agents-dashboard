from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from urllib import error, request

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30


async def post_webhook(
    webhook_url: str,
    payload: dict[str, Any],
    *,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> None:
    def _send() -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        logger.info("Posting webhook to %s", webhook_url)
        req = request.Request(
            webhook_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=timeout) as response:
            status = getattr(response, "status", response.getcode())
            if status >= 400:
                raise RuntimeError(f"Webhook returned status {status}")

    try:
        await asyncio.to_thread(_send)
        logger.info("Webhook delivered to %s", webhook_url)
    except error.HTTPError as e:
        response_body = ""
        try:
            response_body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        logger.error(
            "Webhook failed for %s with HTTP %s: %s%s",
            webhook_url,
            e.code,
            e.reason,
            f" body={response_body}" if response_body else "",
        )
    except Exception as e:
        logger.error("Webhook delivery failed for %s: %s", webhook_url, e)
