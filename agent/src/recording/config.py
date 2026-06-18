from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RecordingConfig:
    """S3 infrastructure config for egress uploads.

    This is purely infrastructure — bucket, region, credentials.
    Whether egress is enabled and which types are active is determined
    by the agent's egress_configs, not by env vars.
    """

    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_force_path_style: bool = False
    s3_base_prefix: str = "agents"
    egress_poll_timeout_seconds: int = 45

    @property
    def available(self) -> bool:
        """True if S3 credentials are configured enough to upload."""
        return bool(self.s3_bucket)


def build_recording_config(env: dict[str, str] | None = None) -> RecordingConfig:
    values = os.environ if env is None else env
    return RecordingConfig(
        s3_bucket=values.get("AWS_S3_BUCKET", ""),
        s3_region=values.get("AWS_DEFAULT_REGION", "us-east-1"),
        s3_endpoint=values.get("AWS_S3_ENDPOINT", ""),
        s3_access_key=values.get("AWS_ACCESS_KEY_ID", ""),
        s3_secret_key=values.get("AWS_SECRET_ACCESS_KEY", ""),
        s3_force_path_style=values.get("AWS_S3_FORCE_PATH_STYLE", "").lower()
        in ("1", "true", "yes"),
        s3_base_prefix=values.get("S3_BASE_PREFIX", "agents"),
        egress_poll_timeout_seconds=int(
            values.get("EGRESS_POLL_TIMEOUT_SECONDS", "45")
        ),
    )
