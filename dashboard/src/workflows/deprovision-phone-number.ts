import { RetryableError } from "workflow";

export type DeprovisionPhoneNumberInput = {
  phoneNumberId: string;
  appWorkflowId: string;
};

export async function deprovisionPhoneNumberWorkflow(
  input: DeprovisionPhoneNumberInput,
) {
  "use workflow";

  const { phone, connection } = await loadConnection(input.phoneNumberId);

  // If the connection is already failed or disconnected with no resources,
  // skip teardown and just clean up the DB state.
  const hasResources =
    connection.vobizCredentialId ||
    connection.vobizInboundTrunkId ||
    connection.vobizOutboundTrunkId ||
    connection.livekitInboundTrunkId ||
    connection.livekitOutboundTrunkId ||
    connection.livekitDispatchRuleId;

  if (!hasResources) {
    await markDisconnected({
      phoneNumberId: phone.id,
      connectionId: connection.id,
      lastError: null,
    });
    await trackCompleted({
      appWorkflowId: input.appWorkflowId,
      message: "Phone number disconnected",
      result: { phoneNumberId: phone.id },
    });
    return { phoneNumberId: phone.id, disconnected: true, error: null };
  }

  let firstError: string | null = null;
  const recordError = (step: string, error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[workflow] ${step} failed: ${msg}`);
    if (!firstError) firstError = `${step}: ${msg}`;
  };

  // Best-effort teardown — continue even if individual steps fail.

  await trackProgress({
    appWorkflowId: input.appWorkflowId,
    phase: "removing_dispatch_rule",
    message: "Removing LiveKit dispatch rule",
    eventKey: "delete_dispatch_rule",
  });
  if (connection.livekitDispatchRuleId) {
    try {
      await deleteLiveKitDispatchRule(connection.livekitDispatchRuleId);
    } catch (error) {
      recordError("deleteLiveKitDispatchRule", error);
    }
  }

  await trackProgress({
    appWorkflowId: input.appWorkflowId,
    phase: "removing_livekit_trunks",
    message: "Removing LiveKit trunks",
    eventKey: "delete_livekit_trunks",
  });
  if (connection.livekitInboundTrunkId) {
    try {
      await deleteLiveKitTrunk(connection.livekitInboundTrunkId);
    } catch (error) {
      recordError("deleteLiveKitInboundTrunk", error);
    }
  }
  if (connection.livekitOutboundTrunkId) {
    try {
      await deleteLiveKitTrunk(connection.livekitOutboundTrunkId);
    } catch (error) {
      recordError("deleteLiveKitOutboundTrunk", error);
    }
  }

  await trackProgress({
    appWorkflowId: input.appWorkflowId,
    phase: "removing_vobiz_resources",
    message: "Removing Vobiz trunks and credential",
    eventKey: "delete_vobiz_resources",
  });
  if (connection.vobizInboundTrunkId) {
    try {
      await deleteVobizTrunk(connection.vobizInboundTrunkId);
    } catch (error) {
      recordError("deleteVobizInboundTrunk", error);
    }
  }
  if (connection.vobizOutboundTrunkId) {
    try {
      await deleteVobizTrunk(connection.vobizOutboundTrunkId);
    } catch (error) {
      recordError("deleteVobizOutboundTrunk", error);
    }
  }
  if (connection.vobizCredentialId) {
    try {
      await deleteVobizCredential(connection.vobizCredentialId);
    } catch (error) {
      recordError("deleteVobizCredential", error);
    }
  }

  // Always update the DB — even if some teardowns failed, mark as disconnected.
  await trackProgress({
    appWorkflowId: input.appWorkflowId,
    phase: "persisting",
    message: "Saving disconnection state",
    eventKey: "mark_disconnected",
  });
  await markDisconnected({
    phoneNumberId: phone.id,
    connectionId: connection.id,
    lastError: firstError,
  });

  await trackCompleted({
    appWorkflowId: input.appWorkflowId,
    message: firstError
      ? "Phone number disconnected with partial errors"
      : "Phone number disconnected",
    result: { phoneNumberId: phone.id, error: firstError },
  });

  return { phoneNumberId: phone.id, disconnected: true, error: firstError };
}

// ---------------------------------------------------------------------------
// Tracking steps
// ---------------------------------------------------------------------------

async function trackProgress(input: {
  appWorkflowId: string;
  phase: string;
  message: string;
  eventKey: string;
}) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  await prisma.appWorkflowRun.update({
    where: { id: input.appWorkflowId },
    data: { phase: input.phase, message: input.message },
  });

  await prisma.appWorkflowEvent.create({
    data: {
      appWorkflowId: input.appWorkflowId,
      status: AppWorkflowStatus.RUNNING,
      phase: input.phase,
      message: input.message,
      eventKey: input.eventKey,
    },
  });
}
trackProgress.maxRetries = 1;

async function trackCompleted(input: {
  appWorkflowId: string;
  message: string;
  result: Record<string, unknown>;
}) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  await prisma.appWorkflowRun.update({
    where: { id: input.appWorkflowId },
    data: {
      status: AppWorkflowStatus.COMPLETED,
      phase: "completed",
      message: input.message,
      result: JSON.parse(JSON.stringify(input.result)),
      completedAt: new Date(),
    },
  });

  await prisma.appWorkflowEvent.create({
    data: {
      appWorkflowId: input.appWorkflowId,
      status: AppWorkflowStatus.COMPLETED,
      phase: "completed",
      message: input.message,
      eventKey: "completed",
    },
  });
}
trackCompleted.maxRetries = 1;

async function trackFailed(input: {
  appWorkflowId: string;
  errorMessage: string;
}) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const { AppWorkflowStatus } = await import("@/generated/prisma/client");

  await prisma.appWorkflowRun.update({
    where: { id: input.appWorkflowId },
    data: {
      status: AppWorkflowStatus.FAILED,
      phase: "failed",
      message: input.errorMessage,
      error: input.errorMessage,
      completedAt: new Date(),
    },
  });

  await prisma.appWorkflowEvent.create({
    data: {
      appWorkflowId: input.appWorkflowId,
      status: AppWorkflowStatus.FAILED,
      phase: "failed",
      message: input.errorMessage,
      eventKey: "failed",
    },
  });
}
trackFailed.maxRetries = 1;

// ---------------------------------------------------------------------------
// Infrastructure steps
// ---------------------------------------------------------------------------

async function loadConnection(phoneNumberId: string) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const phone = await prisma.phoneNumber.findUnique({
    where: { id: phoneNumberId },
    include: { connection: true },
  });
  if (!phone) throw new RetryableError(`Phone number ${phoneNumberId} not found`);
  if (!phone.connection) throw new RetryableError(`Phone number has no connection record`);

  return { phone, connection: phone.connection };
}
loadConnection.maxRetries = 1;

async function deleteLiveKitDispatchRule(dispatchRuleId: string) {
  "use step";

  const { deleteLiveKitSipDispatchRule } = await import("@/lib/livekit");
  try {
    await deleteLiveKitSipDispatchRule(dispatchRuleId);
    return { deleted: true, alreadyMissing: false };
  } catch (error) {
    if (isMissingResourceError(error)) {
      return { deleted: false, alreadyMissing: true };
    }
    throw error;
  }
}
deleteLiveKitDispatchRule.maxRetries = 2;

async function deleteLiveKitTrunk(trunkId: string) {
  "use step";

  const { deleteLiveKitSipTrunk } = await import("@/lib/livekit");
  try {
    await deleteLiveKitSipTrunk(trunkId);
    return { deleted: true, alreadyMissing: false };
  } catch (error) {
    if (isMissingResourceError(error)) {
      return { deleted: false, alreadyMissing: true };
    }
    throw error;
  }
}
deleteLiveKitTrunk.maxRetries = 2;

async function deleteVobizTrunk(trunkId: string) {
  "use step";

  const { deleteVobizTrunk: deleteTrunk } = await import("@/lib/vobiz");
  try {
    await deleteTrunk(trunkId);
    return { deleted: true, alreadyMissing: false };
  } catch (error) {
    if (isMissingResourceError(error)) {
      return { deleted: false, alreadyMissing: true };
    }
    throw error;
  }
}
deleteVobizTrunk.maxRetries = 2;

async function deleteVobizCredential(credentialId: string) {
  "use step";

  const { deleteVobizCredential: deleteCred } = await import("@/lib/vobiz");
  try {
    await deleteCred(credentialId);
    return { deleted: true, alreadyMissing: false };
  } catch (error) {
    if (isMissingResourceError(error)) {
      return { deleted: false, alreadyMissing: true };
    }
    throw error;
  }
}
deleteVobizCredential.maxRetries = 2;

async function markDisconnected(input: {
  phoneNumberId: string;
  connectionId: string;
  lastError: string | null;
}) {
  "use step";

  const { ProvisioningStatus, PhoneNumberStatus, Prisma } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");

  await prisma.phoneNumber.update({
    where: { id: input.phoneNumberId },
    data: { status: PhoneNumberStatus.INACTIVE },
  });

  await prisma.phoneNumberConnection.update({
    where: { id: input.connectionId },
    data: {
      status: ProvisioningStatus.DISCONNECTED,
      lastError: input.lastError,
      vobizCredentialId: null,
      vobizInboundTrunkId: null,
      vobizOutboundTrunkId: null,
      vobizInboundDomain: null,
      vobizOutboundDomain: null,
      livekitInboundTrunkId: null,
      livekitOutboundTrunkId: null,
      livekitDispatchRuleId: null,
      livekitSipEndpoint: null,
      rawVobizCredential: Prisma.JsonNull,
      rawVobizInboundTrunk: Prisma.JsonNull,
      rawVobizOutboundTrunk: Prisma.JsonNull,
      rawLiveKitInboundTrunk: Prisma.JsonNull,
      rawLiveKitOutboundTrunk: Prisma.JsonNull,
      rawLiveKitDispatchRule: Prisma.JsonNull,
    },
  });
}
markDisconnected.maxRetries = 1;

function isMissingResourceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("object cannot be found") ||
    message.includes("Not Found") ||
    message.includes("not found") ||
    message.includes("(404)")
  );
}
