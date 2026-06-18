# Recording → Multi-Egress Refactor Plan

## Goal

Replace the single `recordingType` field (`off | audio | video`) with an array-based multi-egress model. Each agent can have multiple independent egress streams (audio, video, frames). Egress config is fully agent-config-driven — no env vars.

---

## Data Model

### Prisma schema — Agent model

```prisma
egressConfigs  Json  @default("[]")
// Stored as: [{ "type": "audio" }, { "type": "frames", "frameIntervalSec": 5 }]
```

Keep `recordingType` column as orphaned dead weight (SQLite can't DROP COLUMN without table rebuild).

### Prisma schema — Call model

Add `framesUrl String?` alongside existing `audioUrl`, `videoUrl`.

### TypeScript type (contract between dashboard and agent)

```ts
type EgressConfig = {
  type: "audio" | "video" | "frames";
  frameIntervalSec?: number;  // only for "frames", default 5
};
```

### Code constant (agent-side)

```python
MAX_EGRESS_COUNT = 3  # in recording/runtime.py, user can change later
```

---

## Egress Types

| Type | Output | LiveKit egress | S3 path |
|---|---|---|---|
| `audio` | MP3 audio-only | `RoomCompositeEgressRequest(audio_only=True, file_outputs=[MP3])` | `{prefix}/{agent}/sessions/{date}/{room}/audio.mp3` |
| `video` | MP4 (audio + video) | `RoomCompositeEgressRequest(file_outputs=[MP4])` | `{prefix}/{agent}/sessions/{date}/{room}/video.mp4` |
| `frames` | Periodic JPEG screenshots | `RoomCompositeEgressRequest(image_outputs=[ImageOutput])` | `{prefix}/{agent}/sessions/{date}/{room}/frames/frame_0001.jpg` |

All combos allowed. No mutual exclusivity.

## Frame Interval Presets

| Label | `capture_interval` (seconds) |
|---|---|
| High (1 fps) | 1 |
| Medium (1/5s) | 5 |
| Low (1/15s) | 15 |
| Sparse (1/30s) | 30 |

---

## File Changes

### Dashboard — Schema & validation

1. **`dashboard/prisma/schema.prisma`**
   - Add `egressConfigs Json @default("[]")` to Agent
   - Add `framesUrl String?` to Call

2. **`dashboard/src/trpc/routers/agents.ts`**
   - Add `EgressConfigSchema` Zod schema
   - Add `egressConfigs` to `agentInput` and `agentUpdateInput`
   - Validate: max `MAX_EGRESS_COUNT`, no duplicate types, `frameIntervalSec` required for frames

3. **`dashboard/src/app/api/agents/[agentId]/route.ts`**
   - Replace `recording_type: agent.recordingType` with `egress_configs: agent.egressConfigs`

4. **`dashboard/src/lib/dashboard-types.ts`**
   - Replace `recordingType` in `AgentForm` with `egressConfigs: EgressConfig[]`
   - Update `emptyAgentForm`: `egressConfigs: []`

### Dashboard — UI: new "Recording" tab

5. **`dashboard/src/app/(dashboard)/agents/[id]/page.tsx`**
   - Add `"recording"` to `SECTIONS` array
   - Add `{ value: "recording", label: "Recording" }` to `AgentTabs`
   - Add `{activeSection === "recording" ? <RecordingSection ... /> : null}` to render
   - Create new `RecordingSection` component:
     - List of egress config cards (type badge, description, remove button)
     - Frames entries show inline interval preset dropdown
     - "+ Add egress" button with remaining types dropdown
     - Counter `{count}/{MAX}`
     - Auto-save on add/remove
   - Remove recording section from `SettingsSection` (delete lines 487-512, remove `recordingType`/`recordingMutation` state)

6. **`dashboard/src/app/(dashboard)/agents/new/page.tsx`**
   - Add `egressConfigs: []` to create submission (default empty)

### Agent — Python

7. **`agent/src/profile.py`**
   - Replace `recording_type: str = "off"` with `egress_configs: list[dict[str, object]] = field(default_factory=list)`

8. **`agent/src/profile_api.py`**
   - Parse `egress_configs` from API payload
   - Remove `recording_type` parsing

9. **`agent/src/recording/runtime.py`** — biggest change
   - Add `EgressEntry` dataclass: `{ type, egress_id, s3_key, url }`
   - Refactor `RecordingStartState`: replace flat fields with `egresses: tuple[EgressEntry, ...]`
   - Refactor `start_recording()`: accept `egress_configs`, start only configured types
   - Refactor `FinalizeRecordingRequest`: accept `egress_entries`, stop only active egresses
   - Add `MAX_EGRESS_COUNT = 3` constant

10. **`agent/src/server.py`**
    - Replace `agent_recording_type` logic with `egress_types = [c["type"] for c in profile.egress_configs]`
    - Pass `egress_configs` to `start_recording_for_session()`
    - Update `SessionState` to hold `egress_entries`
    - Update `on_session_end` to finalize based on active egress list

11. **`agent/src/recording/db.py`**
    - Add `frames_s3_key TEXT`, `frames_url TEXT` to `agent_sessions`
    - Update `insert_session()` and `update_session_completed()`

12. **`agent/src/clients/aws_s3.py`**
    - Add `build_frames_s3_key()`

### Remove env-based recording config

13. **`agent/src/recording/config.py`**
    - Remove `RecordingConfig` dataclass entirely
    - Remove `build_recording_config()` function

14. **`agent/src/runtime/cache.py`**
    - Remove `get_recording_config()` and `USERDATA_RECORDING_CONFIG`

15. **`agent/src/server.py`**
    - Remove `from recording.config import RecordingConfig`
    - Remove `from runtime.cache import get_recording_config`
    - Remove `rec_cfg = get_recording_config(userdata)` and all `rec_cfg.*` references
    - Recording enablement is now: `egress_configs is non-empty`

---

## Migration

1. Prisma migration: add `egressConfigs` column
2. One-time seed: convert `recordingType` → `egressConfigs`
3. Orphaned `recordingType` column stays (SQLite limitation)

---

## What stays the same

- S3 bucket/region/credentials (still needed for upload target)
- Webhook payload — audio_url/video_url sent; add frames_url as follow-up
- Call model display — show whichever URLs are present
- Agent tab system — adds one more tab
