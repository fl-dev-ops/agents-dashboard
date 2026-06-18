import { FatalError, RetryableError } from "workflow";

export type ProvisionPhoneNumberInput = {
  phoneNumberId: string;
  agentId: string;
  appWorkflowId: string;
};

export async function provisionPhoneNumberWorkflow(
  input: ProvisionPhoneNumberInput,
) {
  "use workflow";

  const phone = await fetchPhoneNumber(input.phoneNumberId);
  if (!phone.vobizNumberId) {
    throw new FatalError("Phone number is not synced from Vobiz — sync first.");
  }

  const agent = await fetchAgent(input.agentId);

  const connection = await upsertConnection(input.phoneNumberId);

  try {
    const trunkName = `Intervoo — ${phone.e164}`;
    const outboundTrunkName = `${trunkName} (Outbound)`;
    const inboundTrunkName = `${trunkName} (Inbound)`;
    const metadata = buildAgentMetadata(agent.agentId);

    // Step 1: Vobiz credential + trunks
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "creating_vobiz_resources",
      message: "Creating Vobiz credential and trunks",
      eventKey: "vobiz_infrastructure",
    });
    const vobiz = await ensureVobizInfrastructure({
      outboundTrunkName,
      inboundTrunkName,
    });

    // Step 2: LiveKit outbound trunk
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "creating_livekit_outbound_trunk",
      message: "Creating LiveKit outbound trunk",
      eventKey: "livekit_outbound_trunk",
    });
    const livekitOutbound = await ensureLiveKitOutboundTrunk({
      trunkName,
      e164: phone.e164,
      vobizSipDomain: vobiz.outboundDomain,
      vobizUsername: vobiz.credentialUsername,
      vobizPassword: vobiz.credentialPassword,
    });

    // Step 3: LiveKit inbound trunk
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "creating_livekit_inbound_trunk",
      message: "Creating LiveKit inbound trunk",
      eventKey: "livekit_inbound_trunk",
    });
    const livekitInbound = await ensureLiveKitInboundTrunk({
      trunkName,
      e164: phone.e164,
    });

    // Step 4: Set Vobiz inbound destination
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "setting_vobiz_inbound_destination",
      message: "Setting Vobiz inbound destination",
      eventKey: "vobiz_inbound_destination",
    });
    const sipEndpoint = await getLiveKitSipEndpoint();
    await setVobizInboundDestination({
      trunkId: vobiz.inboundTrunkId,
      sipEndpoint,
    });

    // Step 5: LiveKit dispatch rule
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "creating_dispatch_rule",
      message: "Creating LiveKit dispatch rule",
      eventKey: "livekit_dispatch_rule",
    });
    const dispatchRule = await ensureLiveKitDispatchRule({
      trunkName,
      inboundTrunkId: livekitInbound.sipTrunkId,
      agentId: agent.agentId,
      metadata,
    });

    // Step 6: Persist to DB
    await trackProgress({
      appWorkflowId: input.appWorkflowId,
      phase: "persisting",
      message: "Saving provisioning state",
      eventKey: "persist_provisioning",
    });
    await persistProvisioning({
      phoneNumberId: phone.id,
      connectionId: connection.id,
      agentId: agent.id,
      vobizCredentialId: vobiz.credentialId,
      vobizOutboundTrunkId: vobiz.outboundTrunkId,
      vobizInboundTrunkId: vobiz.inboundTrunkId,
      vobizOutboundDomain: vobiz.outboundDomain,
      vobizInboundDomain: vobiz.inboundDomain,
      livekitOutboundTrunkId: livekitOutbound.sipTrunkId,
      livekitInboundTrunkId: livekitInbound.sipTrunkId,
      livekitDispatchRuleId: dispatchRule.sipDispatchRuleId,
      livekitSipEndpoint: sipEndpoint,
      rawVobizCredential: vobiz.rawCredential,
      rawVobizOutboundTrunk: vobiz.rawOutboundTrunk,
      rawVobizInboundTrunk: vobiz.rawInboundTrunk,
      rawLiveKitOutboundTrunk: livekitOutbound,
      rawLiveKitInboundTrunk: livekitInbound,
      rawLiveKitDispatchRule: dispatchRule,
    });

    await trackCompleted({
      appWorkflowId: input.appWorkflowId,
      message: "Phone number activated",
      result: { phoneNumberId: phone.id },
    });

    return { phoneNumberId: phone.id, connectionId: connection.id };
  } catch (error) {
    // If any step fails, mark the connection as FAILED so it doesn't stay stuck in PROVISIONING
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markFailed({ connectionId: connection.id, errorMessage });
    await trackFailed({
      appWorkflowId: input.appWorkflowId,
      errorMessage,
    });
    throw error;
  }
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

async function fetchPhoneNumber(phoneNumberId: string) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const phone = await prisma.phoneNumber.findUnique({
    where: { id: phoneNumberId },
    include: { connection: true },
  });
  if (!phone) throw new FatalError(`Phone number ${phoneNumberId} not found`);
  return phone;
}
fetchPhoneNumber.maxRetries = 1;

async function fetchAgent(agentId: string) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new FatalError(`Agent ${agentId} not found`);
  return agent;
}
fetchAgent.maxRetries = 1;

async function upsertConnection(phoneNumberId: string) {
  "use step";

  const { ProvisioningStatus } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");
  return prisma.phoneNumberConnection.upsert({
    where: { phoneNumberId },
    update: { status: ProvisioningStatus.PROVISIONING, lastError: null },
    create: { phoneNumberId, status: ProvisioningStatus.PROVISIONING },
  });
}
upsertConnection.maxRetries = 1;

async function ensureVobizInfrastructure(input: {
  outboundTrunkName: string;
  inboundTrunkName: string;
}) {
  "use step";

  const {
    createVobizCredential,
    createVobizTrunk,
    deleteVobizTrunk,
    findVobizTrunk,
  } = await import("@/lib/vobiz");

  let existingOutbound: { trunk_id: string; credentials_id?: string } | null = await findVobizTrunk({
    name: input.outboundTrunkName,
    direction: "outbound",
  });
  let existingInbound: { trunk_id: string; credentials_id?: string } | null = await findVobizTrunk({
    name: input.inboundTrunkName,
    direction: "inbound",
  });

  // Clean up orphaned trunks — exist in Vobiz but have no credential (from a failed prior provisioning).
  if (existingOutbound && !existingOutbound.credentials_id) {
    await deleteVobizTrunk(existingOutbound.trunk_id);
    existingOutbound = null;
  }
  if (existingInbound && !existingInbound.credentials_id) {
    await deleteVobizTrunk(existingInbound.trunk_id);
    existingInbound = null;
  }

  let credentialId: string;
  let credentialPassword: string;
  let credentialUsername: string;
  let rawCredential: unknown = null;

  if (!existingOutbound || !existingInbound) {
    const cred = await createVobizCredential({ name: `auto-${Date.now()}` });
    rawCredential = cred;
    const created = cred as { id: string; username: string; password?: string };
    if (!created?.id) throw new RetryableError(`Vobiz credential creation returned no id`);
    credentialId = created.id;
    credentialPassword = created.password ?? "";
    credentialUsername = created.username;
  } else {
    credentialId = existingOutbound.credentials_id ?? "";
    credentialPassword = "";
    credentialUsername = "";
  }

  const outboundTrunk = existingOutbound ?? await createVobizTrunk({
    name: input.outboundTrunkName,
    credentialsId: credentialId,
    trunkDirection: "outbound",
  });
  const outboundData = outboundTrunk as { trunk_id: string; trunk_domain?: string };
  if (!outboundData?.trunk_id) throw new RetryableError(`Vobiz outbound trunk returned no trunk_id`);

  const inboundTrunk = existingInbound ?? await createVobizTrunk({
    name: input.inboundTrunkName,
    credentialsId: credentialId,
    trunkDirection: "inbound",
  });
  const inboundData = inboundTrunk as { trunk_id: string; trunk_domain?: string };
  if (!inboundData?.trunk_id) throw new RetryableError(`Vobiz inbound trunk returned no trunk_id`);

  return {
    credentialId,
    credentialPassword,
    credentialUsername,
    outboundTrunkId: outboundData.trunk_id,
    inboundTrunkId: inboundData.trunk_id,
    outboundDomain: outboundData.trunk_domain ?? "",
    inboundDomain: inboundData.trunk_domain ?? "",
    rawCredential,
    rawOutboundTrunk: outboundTrunk,
    rawInboundTrunk: inboundTrunk,
  };
}
ensureVobizInfrastructure.maxRetries = 2;

async function ensureLiveKitOutboundTrunk(input: {
  trunkName: string;
  e164: string;
  vobizSipDomain: string;
  vobizUsername: string;
  vobizPassword: string;
}) {
  "use step";

  const {
    findLiveKitOutboundTrunkByNumber,
    createLiveKitOutboundTrunk,
  } = await import("@/lib/livekit");

  let trunk = await findLiveKitOutboundTrunkByNumber(input.e164);

  if (trunk) return toPlainJson(trunk);

  if (!input.vobizSipDomain) {
    throw new FatalError(
      "Cannot create LiveKit outbound trunk without Vobiz SIP domain.",
    );
  }

  trunk = await createLiveKitOutboundTrunk({
    name: `${input.trunkName} (Outbound)`,
    vobizSipDomain: input.vobizSipDomain,
    vobizUsername: input.vobizUsername,
    vobizPassword: input.vobizPassword,
    numbers: [input.e164],
  });
  if (!trunk?.sipTrunkId) throw new RetryableError(`LiveKit outbound trunk returned no sipTrunkId`);
  return toPlainJson(trunk);
}
ensureLiveKitOutboundTrunk.maxRetries = 3;

async function ensureLiveKitInboundTrunk(input: {
  trunkName: string;
  e164: string;
}) {
  "use step";

  const {
    findLiveKitInboundTrunkByNumber,
    createLiveKitInboundTrunk,
  } = await import("@/lib/livekit");

  let trunk = await findLiveKitInboundTrunkByNumber(input.e164);
  if (trunk) return toPlainJson(trunk);

  trunk = await createLiveKitInboundTrunk({
    name: `${input.trunkName} (Inbound)`,
    numbers: [input.e164],
  });
  if (!trunk?.sipTrunkId) throw new RetryableError(`LiveKit inbound trunk returned no sipTrunkId`);
  return toPlainJson(trunk);
}
ensureLiveKitInboundTrunk.maxRetries = 3;

async function getLiveKitSipEndpoint() {
  "use step";

  const { requireLiveKitSipEndpoint } = await import("@/lib/env");
  return requireLiveKitSipEndpoint();
}
getLiveKitSipEndpoint.maxRetries = 1;

async function setVobizInboundDestination(input: {
  trunkId: string;
  sipEndpoint: string;
}) {
  "use step";

  const { setVobizTrunkInboundDestination } = await import("@/lib/vobiz");
  return setVobizTrunkInboundDestination(input.trunkId, input.sipEndpoint);
}
setVobizInboundDestination.maxRetries = 2;

async function ensureLiveKitDispatchRule(input: {
  trunkName: string;
  inboundTrunkId: string;
  agentId: string;
  metadata: string;
}) {
  "use step";

  const {
    findSipDispatchRulesByTrunkId,
    createLiveKitDispatchRule,
    updateLiveKitDispatchRuleMetadata,
  } = await import("@/lib/livekit");

  const existingRules = await findSipDispatchRulesByTrunkId(input.inboundTrunkId);
  let rule = existingRules[0] ?? null;

  if (!rule) {
    rule = await createLiveKitDispatchRule({
      name: `${input.trunkName} (Dispatch)`,
      rule: { type: "individual", roomPrefix: `call-${input.agentId}-` },
      trunkIds: [input.inboundTrunkId],
      metadata: input.metadata,
    });
  } else if (
    rule.metadata !== input.metadata ||
    rule.roomConfig?.metadata !== input.metadata
  ) {
    rule = await updateLiveKitDispatchRuleMetadata({
      dispatchRule: rule,
      metadata: input.metadata,
    });
  }

  if (!rule?.sipDispatchRuleId) throw new RetryableError(`LiveKit dispatch rule returned no sipDispatchRuleId`);
  return toPlainJson(rule);
}
ensureLiveKitDispatchRule.maxRetries = 2;

async function persistProvisioning(input: {
  phoneNumberId: string;
  connectionId: string;
  agentId: string;
  vobizCredentialId: string;
  vobizOutboundTrunkId: string;
  vobizInboundTrunkId: string;
  vobizOutboundDomain: string;
  vobizInboundDomain: string;
  livekitOutboundTrunkId: string;
  livekitInboundTrunkId: string;
  livekitDispatchRuleId: string;
  livekitSipEndpoint: string;
  rawVobizCredential: unknown;
  rawVobizOutboundTrunk: unknown;
  rawVobizInboundTrunk: unknown;
  rawLiveKitOutboundTrunk: unknown;
  rawLiveKitInboundTrunk: unknown;
  rawLiveKitDispatchRule: unknown;
}) {
  "use step";

  const { ProvisioningStatus, PhoneNumberStatus } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");

  await prisma.phoneNumber.update({
    where: { id: input.phoneNumberId },
    data: {
      agentId: input.agentId,
      status: PhoneNumberStatus.ACTIVE,
    },
  });

  await prisma.phoneNumberConnection.update({
    where: { id: input.connectionId },
    data: {
      status: ProvisioningStatus.ACTIVE,
      lastError: null,
      vobizCredentialId: input.vobizCredentialId,
      vobizOutboundTrunkId: input.vobizOutboundTrunkId,
      vobizInboundTrunkId: input.vobizInboundTrunkId,
      vobizOutboundDomain: input.vobizOutboundDomain,
      vobizInboundDomain: input.vobizInboundDomain,
      livekitOutboundTrunkId: input.livekitOutboundTrunkId,
      livekitInboundTrunkId: input.livekitInboundTrunkId,
      livekitDispatchRuleId: input.livekitDispatchRuleId,
      livekitSipEndpoint: input.livekitSipEndpoint,
      rawVobizCredential: input.rawVobizCredential
        ? JSON.parse(JSON.stringify(input.rawVobizCredential))
        : undefined,
      rawVobizOutboundTrunk: JSON.parse(JSON.stringify(input.rawVobizOutboundTrunk)),
      rawVobizInboundTrunk: JSON.parse(JSON.stringify(input.rawVobizInboundTrunk)),
      rawLiveKitOutboundTrunk: JSON.parse(JSON.stringify(input.rawLiveKitOutboundTrunk)),
      rawLiveKitInboundTrunk: JSON.parse(JSON.stringify(input.rawLiveKitInboundTrunk)),
      rawLiveKitDispatchRule: JSON.parse(JSON.stringify(input.rawLiveKitDispatchRule)),
    },
  });
}
persistProvisioning.maxRetries = 1;

async function markFailed(input: { connectionId: string; errorMessage: string }) {
  "use step";

  const { ProvisioningStatus } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");

  await prisma.phoneNumberConnection.update({
    where: { id: input.connectionId },
    data: {
      status: ProvisioningStatus.FAILED,
      lastError: input.errorMessage,
    },
  });
}
markFailed.maxRetries = 2;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function buildAgentMetadata(agentId: string) {
  return JSON.stringify({
    agent_id: agentId,
    interaction_mode: "auto",
  });
}

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
