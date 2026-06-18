# Workflow Tracking & Sonner Sync

## Goal

Build a reusable, durable workflow notification system that works for any
long-running workflow and keeps `sonner` toasts in sync with actual workflow
progress.

The principle is:

- **Workflow SDK** is the execution engine.
- **AppWorkflowRun table** is the durable product/UI workflow state.
- **Sonner** is the renderer of that durable state.

This removes phone-number-specific logic and scales to any future workflow
that takes seconds, minutes, or longer.

## Concept

Developers get an experience similar to `toast.promise()`, but backed by the
database instead of an in-memory JS promise.

```ts
// Familiar promise-style API
toast.promise(triggerWorkflow(), {
  loading: "Activating phone number",
  success: "Phone number activated",
  error: "Activation failed",
});
```

becomes

```ts
// Durable variant
workflowToast.track(appWorkflowId, {
  loading: "Activating phone number",
  success: "Phone number activated",
  error: "Activation failed",
});
```

For most cases the global `WorkflowToastProvider` auto-tracks active workflows,
so pages do not call anything manually.

## Database

Add generic workflow tracking models to
`dashboard/prisma/schema.prisma`.

```prisma
enum AppWorkflowStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

model AppWorkflowRun {
  id             String            @id @default(cuid())
  workflowRunId  String?           @unique
  workflowName   String
  operation      String
  status         AppWorkflowStatus @default(QUEUED)
  phase          String?
  title          String
  message        String?
  resourceType   String?
  resourceId     String?
  resourceLabel  String?
  error          String?
  result         Json?
  metadata       Json?
  idempotencyKey String?
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  events         AppWorkflowEvent[]

  @@index([status])
  @@index([operation])
  @@index([resourceType, resourceId])
  @@index([idempotencyKey])
}

model AppWorkflowEvent {
  id             String           @id @default(cuid())
  appWorkflowId  String
  appWorkflow    AppWorkflowRun   @relation(fields: [appWorkflowId], references: [id], onDelete: Cascade)
  status         AppWorkflowStatus
  phase          String?
  message        String?
  eventKey       String?
  metadata       Json?
  createdAt      DateTime         @default(now())

  @@unique([appWorkflowId, eventKey])
  @@index([appWorkflowId, createdAt])
}
```

`AppWorkflowRun` holds current state; `AppWorkflowEvent` is the timeline / audit
log. `eventKey` makes timeline writes idempotent under step retries.

## Workflow Tracking Helper

Create `dashboard/src/lib/workflow-tracking.ts`.

Functions:

- `startTrackedWorkflow`
- `updateWorkflowProgress`
- `completeWorkflow`
- `failWorkflow`
- `cancelWorkflow` (later)

`startTrackedWorkflow` responsibilities:

- optionally guard against duplicates via `idempotencyKey`
- create `AppWorkflowRun` (`QUEUED`)
- call Workflow SDK `start()`
- save `workflowRunId`
- return a serializable payload:

```ts
{
  appWorkflowId: string;
  workflowRunId: string;
  operation: string;
}
```

Do not return raw Workflow SDK `Run` objects through tRPC.

Idempotency:

- If a row with the same `idempotencyKey` exists and is `QUEUED`/`RUNNING`,
  return it instead of starting a new workflow.
- Optional caller:

```ts
startTrackedWorkflow({
  ...,
  idempotencyKey: `phone_number:${phoneNumberId}:activate`,
});
```

## Workflow Pattern

Every tracked workflow accepts `appWorkflowId`.

```ts
type ProvisionPhoneNumberInput = {
  phoneNumberId: string;
  agentId: string;
  appWorkflowId: string;
};
```

Workflow phases:

- `validating`
- `creating_vobiz_resources`
- `creating_livekit_outbound_trunk`
- `creating_livekit_inbound_trunk`
- `creating_dispatch_rule`
- `persisting`
- `completed` / `failed`

At each major step:

```ts
await updateWorkflowProgress({
  appWorkflowId,
  status: "RUNNING",
  phase: "creating_livekit_outbound_trunk",
  message: "Creating LiveKit outbound trunk",
});
```

On success:

```ts
await completeWorkflow({
  appWorkflowId,
  message: "Phone number activated",
  result: { phoneNumberId },
});
```

On failure:

```ts
await failWorkflow({
  appWorkflowId,
  errorMessage,
});
```

Step retry idempotency (per Workflow SDK docs):

- Use `getStepMetadata().stepId` for external API idempotency keys.
- For non-keyed APIs, continue the “find existing first, create if missing”
  pattern.
- Treat `Not Found` on cleanup steps as already-removed success.

## tRPC Router

Add `dashboard/src/trpc/routers/workflow-runs.ts`.

Procedures:

- `listActive`
- `listRecentUnseen`
- `byId`
- `events`
- `markSeen`

Register in `dashboard/src/trpc/routers/_app.ts`.

```ts
workflowRuns.listActive
workflowRuns.listRecentUnseen
workflowRuns.byId({ id })
workflowRuns.events({ id })
workflowRuns.markSeen({ id })
```

## Global Workflow Toast Provider

Create `dashboard/src/components/dashboard/workflow-toast-provider.tsx`.

Mount globally near existing client providers in
`dashboard/src/app/layout.tsx`.

Behavior:

- polls `workflowRuns.listActive` (~1.5s while any active workflow exists)
- polls `workflowRuns.listRecentUnseen` for terminal workflows that should
  still be visible after navigation/refresh
- renders one sonner toast per workflow with a stable ID
- updates an existing toast as phase/message changes
- replaces loading toast with success/error on terminal status
- persists dismissed/seen workflow IDs in `localStorage`

Stable sonner IDs:

```
workflow:${appWorkflowId}
```

Status mapping:

| Status     | Sonner                              |
| ---------- | ----------------------------------- |
| `QUEUED`   | `toast.loading(title, { id })`      |
| `RUNNING`  | `toast.loading(title, { id, ... })` |
| `COMPLETED`| `toast.success(title, { id })`      |
| `FAILED`   | `toast.error(title, { id, ... })`   |
| `CANCELLED`| `toast.warning(title, { id })`      |

## Route Change Durability

Because `WorkflowToastProvider` is mounted globally:

- route changes do not lose the toast
- polling continues
- toast updates from DB state

Refresh behavior:

- active runs are rehydrated from DB
- terminal runs that are still unseen are re-shown
- seen workflow IDs are stored in `localStorage`

LocalStorage keys:

- `workflow-toast-seen:<appWorkflowId>`

No multi-user notification table at this stage.

## Optional Manual API

`useWorkflowToast()` returns:

```ts
track(appWorkflowId, messages)
dismiss(appWorkflowId)
```

Only needed for callers that want to override the auto-rendered toast title.

## Domain Integration

Domain state remains separate from workflow state.

For phone numbers:

- `PhoneNumberConnection.status` remains domain truth.
- `AppWorkflowRun.status` is the operation / notification truth.

Activation:

- domain: `PROVISIONING -> ACTIVE | FAILED`
- workflow: `QUEUED -> RUNNING -> COMPLETED | FAILED`

Disconnect:

- domain: `DEPROVISIONING -> DISCONNECTED | FAILED`
- workflow: `QUEUED -> RUNNING -> COMPLETED | FAILED`

This keeps notification logic generic.

## Phone Number Changes

`dashboard/src/trpc/routers/phone-numbers.ts`:

- `assign`: use `startTrackedWorkflow`, set
  `idempotencyKey: phone_number:${id}:activate`.
- `disconnect`: set domain status `DEPROVISIONING`, then
  `startTrackedWorkflow` with
  `idempotencyKey: phone_number:${id}:disconnect`.
- Return `{ appWorkflowId, workflowRunId }`.

Phone workflows:

- accept `appWorkflowId`
- add phase/message updates
- call `completeWorkflow` on success
- call `failWorkflow` on error

`dashboard/src/app/(dashboard)/phone-numbers/[id]/page.tsx`:

- remove `awaitingActivation`, `awaitingDisconnect`
- remove component-level final toast effects
- keep domain-status polling for badges and disabled buttons

## Streaming Layer (Later)

If we want detailed live logs in a workflow detail drawer:

- Workflow SDK `getWritable()` progress streams
- API route to resume stream by `workflowRunId`
- Store stream cursor / tail index on client

Not needed for sonner lifecycle. DB tracking is the durable source for
notifications; streams are best for verbose logs and a workflow inspector
panel.

## Workflow SDK Worlds

Use Local World in dev. Use Vercel World or Postgres World in production as
appropriate.

The `AppWorkflowRun` table is portable across all Worlds.

## Execution Plan

1. Add Prisma enum + models.
2. `npx prisma generate`.
3. Build `dashboard/src/lib/workflow-tracking.ts`.
4. Add `workflowRuns` tRPC router and register it.
5. Build `WorkflowToastProvider` and mount globally.
6. Convert `phoneNumbers.assign` and `phoneNumbers.disconnect` to tracked
   workflows.
7. Update phone workflows to accept `appWorkflowId` and call progress/complete/fail.
8. Remove page-local workflow toast lifecycle in phone-number detail page.
9. Add idempotency key check in `startTrackedWorkflow`.
10. Add event idempotency (`eventKey` unique constraint).
11. Test activate/disconnect across navigation and refresh.
12. Run `bun test` and `npm run build`.

## Validation Checklist

- Trigger activate, navigate to another page, toast remains.
- Trigger activate, refresh, toast reappears as running.
- Workflow completes, toast turns success only after durable `COMPLETED`.
- Trigger disconnect, same behavior.
- Double-click Activate does not create duplicate active workflows.
- Failed workflow shows durable error toast.
- Terminal workflow does not re-toast forever after dismissal.
- `bun test` passes.
- `npm run build` passes.

## Out of Scope (Now)

- Multi-user notification persistence
- Per-user seen state in DB
- Detailed workflow inspector / live log panel (streams)
- Workflow cancellation UI