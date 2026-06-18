import { start } from "workflow/api";

type StartTrackedWorkflowOptions<TInput extends Record<string, unknown>> = {
  workflow: (input: TInput & { appWorkflowId: string }) => Promise<unknown>;
  input: TInput;
  workflowName: string;
  operation: string;
  title: string;
  message?: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

type StartTrackedWorkflowResult = {
  appWorkflowId: string;
  workflowRunId: string;
  operation: string;
};

export async function startTrackedWorkflow<TInput extends Record<string, unknown>>(
  options: StartTrackedWorkflowOptions<TInput>,
): Promise<StartTrackedWorkflowResult> {
  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  const {
    workflow,
    input,
    workflowName,
    operation,
    title,
    message,
    resourceType,
    resourceId,
    resourceLabel,
    idempotencyKey,
    metadata,
  } = options;

  // Idempotency check: if a row with this key is QUEUED or RUNNING, return it
  if (idempotencyKey) {
    const existing = await prisma.appWorkflowRun.findFirst({
      where: {
        idempotencyKey,
        status: { in: [AppWorkflowStatus.QUEUED, AppWorkflowStatus.RUNNING] },
      },
    });
    if (existing) {
      return {
        appWorkflowId: existing.id,
        workflowRunId: existing.workflowRunId ?? "",
        operation: existing.operation,
      };
    }
  }

  const appWorkflowRun = await prisma.appWorkflowRun.create({
    data: {
      workflowName,
      operation,
      status: AppWorkflowStatus.QUEUED,
      title,
      message,
      resourceType,
      resourceId,
      resourceLabel,
      idempotencyKey,
      ...(metadata ? { metadata: JSON.parse(JSON.stringify(metadata)) } : {}),
    },
  });

  // Inject appWorkflowId into the workflow input
  const workflowInput = { ...input, appWorkflowId: appWorkflowRun.id } as TInput & { appWorkflowId: string };
  const run = await start(workflow, [workflowInput]);

  // Persist workflowRunId and transition to RUNNING
  await prisma.appWorkflowRun.update({
    where: { id: appWorkflowRun.id },
    data: {
      workflowRunId: run.runId,
      status: AppWorkflowStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  return {
    appWorkflowId: appWorkflowRun.id,
    workflowRunId: run.runId,
    operation,
  };
}

type UpdateWorkflowProgressOptions = {
  appWorkflowId: string;
  status?: string;
  phase?: string;
  message?: string;
  eventKey?: string;
  metadata?: Record<string, unknown>;
};

export async function updateWorkflowProgress(
  options: UpdateWorkflowProgressOptions,
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  const { appWorkflowId, status, phase, message, eventKey, metadata } = options;

  await prisma.appWorkflowRun.update({
    where: { id: appWorkflowId },
    data: {
      ...(status ? { status: status as any } : {}),
      ...(phase ? { phase } : {}),
      ...(message ? { message } : {}),
    },
  });

  // Write timeline event (idempotent via eventKey)
  if (eventKey) {
    await prisma.appWorkflowEvent.create({
      data: {
        appWorkflowId,
        status: (status as any) ?? AppWorkflowStatus.RUNNING,
        phase,
        message,
        eventKey,
        ...(metadata ? { metadata: JSON.parse(JSON.stringify(metadata)) } : {}),
      },
    });
  }
}

type CompleteWorkflowOptions = {
  appWorkflowId: string;
  message?: string;
  result?: Record<string, unknown>;
};

export async function completeWorkflow(
  options: CompleteWorkflowOptions,
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  const { appWorkflowId, message, result } = options;

  await prisma.appWorkflowRun.update({
    where: { id: appWorkflowId },
    data: {
      status: AppWorkflowStatus.COMPLETED,
      phase: "completed",
      message,
      ...(result ? { result: JSON.parse(JSON.stringify(result)) } : {}),
      completedAt: new Date(),
    },
  });

  await prisma.appWorkflowEvent.create({
    data: {
      appWorkflowId,
      status: AppWorkflowStatus.COMPLETED,
      phase: "completed",
      message,
      eventKey: "completed",
    },
  });
}

type FailWorkflowOptions = {
  appWorkflowId: string;
  errorMessage: string;
};

export async function failWorkflow(
  options: FailWorkflowOptions,
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  const { appWorkflowId, errorMessage } = options;

  await prisma.appWorkflowRun.update({
    where: { id: appWorkflowId },
    data: {
      status: AppWorkflowStatus.FAILED,
      phase: "failed",
      message: errorMessage,
      error: errorMessage,
      completedAt: new Date(),
    },
  });

  await prisma.appWorkflowEvent.create({
    data: {
      appWorkflowId,
      status: AppWorkflowStatus.FAILED,
      phase: "failed",
      message: errorMessage,
      eventKey: "failed",
    },
  });
}
