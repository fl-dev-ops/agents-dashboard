import { FatalError, RetryableError } from "workflow";

export type DialPlaygroundNumberInput = {
  agentId: string;
  phoneNumberId?: string;
  toNumber: string;
  userId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
};

function createRoomName() {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function dialPlaygroundNumberWorkflow(
  input: DialPlaygroundNumberInput,
) {
  "use workflow";

  const agent = await fetchAgent(input.agentId);
  const phoneNumber = input.phoneNumberId
    ? await fetchPhoneNumber(input.phoneNumberId)
    : null;
  const metadata = buildAgentMetadata(agent, {
    userId: input.userId,
    interactionMode: "auto",
  });
  const roomName = createRoomName();

  const call = await createCallRecord({
    roomName,
    toNumber: input.toNumber,
    fromNumber: phoneNumber?.e164 ?? null,
    agentId: agent.id,
    phoneNumberId: phoneNumber?.id ?? null,
    metadata: JSON.parse(metadata),
  });
  const dispatchMetadata = buildAgentMetadata(agent, {
    userId: input.userId,
    sessionId: call.id,
    interactionMode: "auto",
    webhookUrl: input.webhookUrl,
    webhookSecret: input.webhookSecret,
  });
  await updateCallMetadata({ callId: call.id, metadata: JSON.parse(dispatchMetadata) });

  // Phase 1: Pre-SIP setup — failures here are terminal.
  let dispatchId: string | null;
  try {
    const result = await dispatchAgent({ roomName, metadata: dispatchMetadata });
    dispatchId = result.dispatchId;

    if (!phoneNumber?.connection?.livekitOutboundTrunkId) {
      throw new FatalError(
        "Selected phone number is missing a LiveKit outbound trunk ID.",
      );
    }
  } catch (error) {
    await markCallFailed({
      callId: call.id,
      errorMessage:
        error instanceof Error ? error.message : "Unknown call error",
    });
    throw error;
  }

  // Phase 2: SIP INVITE — returns immediately (non-blocking).
  // If this throws, the call never reached the callee → FAILED is correct.
  let participant: { participantId: string | null; sipCallId: string | null };
  try {
    participant = await createOutboundCall({
      trunkId: phoneNumber.connection.livekitOutboundTrunkId,
      toNumber: input.toNumber,
      roomName,
      fromNumber: phoneNumber.e164,
    });
  } catch (error) {
    await markCallFailed({
      callId: call.id,
      errorMessage:
        error instanceof Error ? error.message : "Unknown call error",
    });
    throw error;
  }

  // Phase 3: Post-SIP bookkeeping — if this fails, the SIP INVITE is
  // already out and the call may connect. Don't mark FAILED; let webhooks
  // drive the terminal state.
  try {
    await markCallDialing({
      callId: call.id,
      livekitDispatchId: dispatchId,
      participantId: participant.participantId ?? null,
      sipCallId: participant.sipCallId ?? null,
    });
  } catch (error) {
    console.error("[workflow] markCallDialing failed (SIP INVITE is already out):", error);
    // Don't throw — the call might still connect and webhooks will handle it.
  }
}

async function fetchAgent(agentId: string) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  return prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
}
fetchAgent.maxRetries = 1;

async function fetchPhoneNumber(phoneNumberId: string) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  return prisma.phoneNumber.findUniqueOrThrow({
    where: { id: phoneNumberId },
    include: { connection: true },
  });
}
fetchPhoneNumber.maxRetries = 1;

async function createCallRecord(input: {
  roomName: string;
  toNumber: string;
  fromNumber: string | null;
  agentId: string;
  phoneNumberId: string | null;
  metadata: unknown;
}) {
  "use step";

  const { CallStatus, CallType } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");
  return prisma.call.create({
    data: {
      type: CallType.PLAYGROUND,
      status: CallStatus.QUEUED,
      roomName: input.roomName,
      toNumber: input.toNumber,
      fromNumber: input.fromNumber,
      agentId: input.agentId,
      phoneNumberId: input.phoneNumberId,
      metadata: JSON.parse(JSON.stringify(input.metadata)),
    },
  });
}
createCallRecord.maxRetries = 1;

async function updateCallMetadata(input: { callId: string; metadata: unknown }) {
  "use step";

  const { prisma } = await import("@/lib/prisma");
  return prisma.call.update({
    where: { id: input.callId },
    data: { metadata: JSON.parse(JSON.stringify(input.metadata)) },
  });
}
updateCallMetadata.maxRetries = 1;

async function dispatchAgent(input: {
  roomName: string;
  metadata: string;
}) {
  "use step";

  const { createAgentDispatch } = await import("@/lib/livekit");
  const dispatch = await createAgentDispatch({
    roomName: input.roomName,
    metadata: input.metadata,
  });

  const dispatchId =
    (dispatch as { id?: string; dispatchId?: string }).id ||
    (dispatch as { id?: string; dispatchId?: string }).dispatchId ||
    null;

  return { dispatchId };
}
dispatchAgent.maxRetries = 2;

async function createOutboundCall(input: {
  trunkId: string;
  toNumber: string;
  roomName: string;
  fromNumber: string;
}) {
  "use step";

  try {
    const { createOutboundSipParticipant } = await import("@/lib/livekit");
    const result = await createOutboundSipParticipant({
      trunkId: input.trunkId,
      toNumber: input.toNumber,
      roomName: input.roomName,
      participantIdentity: `sip_${input.toNumber}`,
      participantName: input.toNumber,
      fromNumber: input.fromNumber,
    });

    return {
      participantId: result.participantId ?? null,
      sipCallId: result.sipCallId ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Rate limit is still retryable — it's an API limit, not a call outcome.
    if (message.includes("429")) {
      throw new RetryableError(`Rate limited: ${message}`, {
        retryAfter: "30s",
      });
    }

    throw error;
  }
}
createOutboundCall.maxRetries = 3;

async function markCallDialing(input: {
  callId: string;
  livekitDispatchId: string | null;
  participantId: string | null;
  sipCallId: string | null;
}) {
  "use step";
  const { CallStatus } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");
  return prisma.call.update({
    where: { id: input.callId },
    data: {
      status: CallStatus.DIALING,
      livekitDispatchId: input.livekitDispatchId,
      livekitSipParticipantId: input.participantId,
      livekitSipCallId: input.sipCallId,
    },
  });
}
markCallDialing.maxRetries = 1;

async function markCallFailed(input: {
  callId: string;
  errorMessage: string;
}) {
  "use step";
  const { CallStatus } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");
  return prisma.call.update({
    where: { id: input.callId },
    data: {
      status: CallStatus.FAILED,
      errorMessage: input.errorMessage,
      endedAt: new Date(),
    },
  });
}
markCallFailed.maxRetries = 2;

function buildAgentMetadata(
  agent: { agentId: string },
  opts: {
    userId?: string;
    sessionId?: string;
    interactionMode?: "auto" | "ptt";
    webhookUrl?: string;
    webhookSecret?: string;
  },
) {
  return JSON.stringify({
    agent_id: agent.agentId,
    ...(opts.userId ? { user_id: opts.userId } : {}),
    ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
    ...(opts.interactionMode ? { interaction_mode: opts.interactionMode } : {}),
    ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
    ...(opts.webhookSecret ? { webhook_secret: opts.webhookSecret } : {}),
  });
}
