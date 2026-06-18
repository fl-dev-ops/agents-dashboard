import { RoomConfiguration, SIPDispatchRuleInfo } from "@livekit/protocol";
import { AgentDispatchClient, SipClient } from "livekit-server-sdk";

import { ProvisioningStatus } from "@/generated/prisma/client";
import type { Agent } from "@/generated/prisma/client";
import { env, getCallWebhookUrl, requireLiveKitEnv, requireLiveKitSipEndpoint } from "@/lib/env";

type AgentMetadataOptions = {
  userId?: string;
  sessionId?: string;
  interactionMode?: "auto" | "ptt";
  webhookUrl?: string;
  webhookSecret?: string;
  config?: {
    voice?: string;
    dictId?: string;
    speakingSpeed?: number;
  };
};

export function buildAgentMetadata(
  agent: Pick<Agent, "agentId">,
  opts: AgentMetadataOptions = {},
) {
  return JSON.stringify({
    agent_id: agent.agentId,
    ...(opts.userId ? { user_id: opts.userId } : {}),
    ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
    ...(opts.interactionMode ? { interaction_mode: opts.interactionMode } : {}),
    ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
    ...(opts.webhookSecret ? { webhook_secret: opts.webhookSecret } : {}),
    ...(opts.config
      ? {
          config: {
            ...(opts.config.voice ? { voice: opts.config.voice } : {}),
            ...(opts.config.dictId ? { dict_id: opts.config.dictId } : {}),
            ...(opts.config.speakingSpeed
              ? { speaking_speed: opts.config.speakingSpeed }
              : {}),
          },
        }
      : {}),
  });
}

export function buildRoomConfiguration(metadata: string) {
  return new RoomConfiguration({ metadata });
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

function createDispatchClient() {
  const livekit = requireLiveKitEnv();
  return new AgentDispatchClient(
    livekit.url,
    livekit.apiKey,
    livekit.apiSecret,
  );
}

function createSipClient() {
  const livekit = requireLiveKitEnv();
  return new SipClient(livekit.url, livekit.apiKey, livekit.apiSecret);
}

// ---------------------------------------------------------------------------
// Agent dispatch (for outbound calls)
// ---------------------------------------------------------------------------

export async function createAgentDispatch(input: {
  roomName: string;
  metadata: string;
  agentName?: string;
}) {
  const client = createDispatchClient();
  return client.createDispatch(input.roomName, input.agentName ?? env.AGENT_NAME, {
    metadata: input.metadata,
  });
}

// ---------------------------------------------------------------------------
// LiveKit SIP trunks
// ---------------------------------------------------------------------------

/**
 * Create a LiveKit outbound SIP trunk pointing at Vobiz.
 *
 * Vobiz supplies: sip_domain, username, password.
 * LiveKit needs:  address (the sip_domain), authUsername, authPassword, numbers.
 */
export async function createLiveKitOutboundTrunk(input: {
  /** Human-readable name (e.g. "Vobiz Outbound") */
  name: string;
  /** Vobiz SIP domain — e.g. "xyz123.sip.vobiz.ai" */
  vobizSipDomain: string;
  /** Vobiz SIP username */
  vobizUsername: string;
  /** Vobiz SIP password */
  vobizPassword: string;
  /** E.164 phone numbers authorized on this trunk */
  numbers?: string[];
}) {
  const client = createSipClient();

  return client.createSipOutboundTrunk(
    input.name,
    input.vobizSipDomain,
    input.numbers ?? [],
    // @ts-expect-error — transport is typed required but optional at runtime
    {
      authUsername: input.vobizUsername,
      authPassword: input.vobizPassword,
    },
  );
}

/**
 * Create a LiveKit inbound SIP trunk.
 *
 * Vobiz will route inbound calls to this trunk's SIP URI.
 * We set inbound_allowed_addresses to 0.0.0.0/0 (accept all) and
 * add the Vobiz phone numbers so LiveKit knows which numbers route here.
 */
export async function createLiveKitInboundTrunk(input: {
  /** Human-readable name (e.g. "Vobiz Inbound") */
  name: string;
  /** E.164 numbers that should route to this trunk */
  numbers: string[];
  /** Optional auth credentials for the inbound trunk */
  authUsername?: string;
  authPassword?: string;
}) {
  const client = createSipClient();

  return client.createSipInboundTrunk(input.name, input.numbers, {
    allowedAddresses: ["0.0.0.0/0"],
    allowedNumbers: input.numbers,
    ...(input.authUsername
      ? { authUsername: input.authUsername, authPassword: input.authPassword }
      : {}),
  });
}

/**
 * Get just the address (host) from a LiveKit inbound trunk.
 * We find the trunk by its number and return its SIP domain address.
 * The returned value is used as the Vobiz `inbound_destination`.
 */
export async function getLiveKitInboundTrunkAddress(trunkId: string) {
  const client = createSipClient();
  const trunks = await client.listSipInboundTrunk({ trunkIds: [trunkId] });
  return trunks[0]?.allowedAddresses[0];
}

/**
 * Find an existing LiveKit inbound trunk that covers a given phone number.
 * Returns the trunk's SIP info if found, or null if none exists.
 */
export async function findLiveKitInboundTrunkByNumber(number: string) {
  const client = createSipClient();
  const trunks = await client.listSipInboundTrunk({ numbers: [number] });
  return trunks[0] ?? null;
}

/**
 * Find an existing LiveKit outbound trunk that covers a given phone number.
 * Returns the trunk's SIP info if found, or null if none exists.
 */
export async function findLiveKitOutboundTrunkByNumber(number: string) {
  const client = createSipClient();
  const trunks = await client.listSipOutboundTrunk({ numbers: [number] });
  return trunks[0] ?? null;
}

// ---------------------------------------------------------------------------
// LiveKit SIP dispatch rules
// ---------------------------------------------------------------------------

/**
 * Find existing SIP dispatch rules attached to a given inbound trunk.
 */
export async function findSipDispatchRulesByTrunkId(trunkId: string) {
  const client = createSipClient();
  return client.listSipDispatchRule({ trunkIds: [trunkId] });
}

/**
 * Delete a LiveKit SIP trunk by ID.
 */
export async function deleteLiveKitSipTrunk(trunkId: string) {
  const client = createSipClient();
  return client.deleteSipTrunk(trunkId);
}

/**
 * Delete a LiveKit SIP dispatch rule by ID.
 */
export async function deleteLiveKitSipDispatchRule(dispatchRuleId: string) {
  const client = createSipClient();
  return client.deleteSipDispatchRule(dispatchRuleId);
}

/**
 * Create a SIP dispatch rule so inbound calls route to the agent.
 *
 * - type "individual": LiveKit auto-launches an agent per call using roomPrefix.
 *   Room name will be "{roomPrefix}-{uuid}".
 * - trunkIds: routes only from the specified inbound trunks.
 *
 * The agentName must match the agent registered with LiveKit Agents SDK.
 */
export async function createLiveKitDispatchRule(input: {
  /** Human-readable name */
  name: string;
  /** "individual" (auto-launch per call) or "direct" (specific room) */
  rule:
    | { type: "individual"; roomPrefix: string; pin?: string }
    | { type: "direct"; roomName: string; pin?: string };
  /** LiveKit inbound trunk IDs that should trigger this rule */
  trunkIds: string[];
  /** Metadata consumed by the Python worker from room metadata */
  metadata?: string;
}) {
  const client = createSipClient();
  return client.createSipDispatchRule(input.rule, {
    name: input.name,
    metadata: input.metadata,
    roomConfig: input.metadata
      ? buildRoomConfiguration(input.metadata)
      : undefined,
    trunkIds: input.trunkIds,
  });
}

export async function updateLiveKitDispatchRuleMetadata(input: {
  dispatchRule: SIPDispatchRuleInfo;
  metadata: string;
}) {
  const client = createSipClient();
  const updatedRule = new SIPDispatchRuleInfo({
    ...input.dispatchRule,
    metadata: input.metadata,
    roomConfig: buildRoomConfiguration(input.metadata),
  });

  return client.updateSipDispatchRule(
    input.dispatchRule.sipDispatchRuleId,
    updatedRule,
  );
}

function hasDispatchRuleMetadata(
  dispatchRule: SIPDispatchRuleInfo,
  metadata: string,
) {
  return (
    dispatchRule.metadata === metadata &&
    dispatchRule.roomConfig?.metadata === metadata
  );
}

// ---------------------------------------------------------------------------
// Outbound SIP participant (dial a number)
// ---------------------------------------------------------------------------

export async function createOutboundSipParticipant(input: {
  trunkId: string;
  toNumber: string;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  fromNumber?: string;
}) {
  const client = createSipClient();

  return client.createSipParticipant(
    input.trunkId,
    input.toNumber,
    input.roomName,
    {
      participantIdentity: input.participantIdentity,
      participantName: input.participantName,
      fromNumber: input.fromNumber,
      // Non-blocking: returns immediately after SIP INVITE is sent.
      // Call progress (ringing, answered, failed) is tracked via webhooks.
      waitUntilAnswered: false,
      krispEnabled: true,
      ringingTimeout: 60,  // max 60s of ringing before auto-cancel
      maxCallDuration: 3600, // safety cap: 1 hour
    },
  );
}

// ---------------------------------------------------------------------------
// Orchestrator — wire everything together
// ---------------------------------------------------------------------------

/**
 * Result of connecting a phone number to an agent.
 * All IDs are stored on the PhoneNumber record.
 */
export type PhoneNumberConnectResult = {
  /** This number's record ID */
  phoneNumberId: string;
  /** Connection record ID */
  connectionId: string;
  /** LiveKit inbound trunk ID (for receiving calls) */
  livekitInboundTrunkId: string;
  /** LiveKit outbound trunk ID (for making calls) */
  livekitOutboundTrunkId: string;
  /** LiveKit SIP dispatch rule ID */
  livekitDispatchRuleId: string;
};

/**
 * Connect a Vobiz phone number to a LiveKit agent.
 *
 * Steps:
 *  1. Create a Vobiz SIP Credential (if not using existing)
 *  2. Create a Vobiz outbound trunk (direction: "outbound")
 *     → stores sip_domain + username + password
 *  3. Create a Vobiz inbound trunk (direction: "inbound")
 *     → routes inbound to LiveKit when inbound_destination is set
 *  4. Create LiveKit outbound trunk (→ Vobiz)
 *  5. Create LiveKit inbound trunk (← Vobiz)
 *  6. Get LiveKit SIP URI from inbound trunk
 *  7. Update Vobiz inbound trunk with inbound_destination = LiveKit SIP URI
 *  8. Create LiveKit dispatch rule (individual, triggers agent)
 *  9. Persist trunk IDs + dispatch rule ID to PhoneNumber record
 *
 * The agent's agentId is used as the agentName in the dispatch rule.
 * The agent must register with LiveKit Agents SDK using this same name.
 */
export async function connectPhoneNumberToAgent(input: {
  /** Vobiz phone number object (from sync) */
  vobizNumber: { id: string; e164: string };
  /** Agent record (agentId must match LiveKit agent registration) */
  agent: Pick<Agent, "id" | "agentId">;
  /** Optional existing Vobiz credential ID to reuse */
  vobizCredentialId?: string;
}): Promise<PhoneNumberConnectResult> {
  // Lazy-import here avoids top-level issues in non-Next contexts
  const { createVobizCredential, createVobizTrunk, findVobizTrunk, setVobizTrunkInboundDestination } =
    await import("@/lib/vobiz");
  const { prisma } = await import("@/lib/prisma");

  const trunkName = `Intervoo — ${input.vobizNumber.e164}`;
  const outboundTrunkName = `${trunkName} (Outbound)`;
  const inboundTrunkName = `${trunkName} (Inbound)`;
  const livekitSipEndpoint = requireLiveKitSipEndpoint();
  const metadata = buildAgentMetadata(input.agent, {
    interactionMode: "auto",
    webhookUrl: getCallWebhookUrl(),
    webhookSecret: env.CALL_WEBHOOK_SECRET,
  });
  const connection = await prisma.phoneNumberConnection.upsert({
    where: { phoneNumberId: input.vobizNumber.id },
    update: { status: ProvisioningStatus.PROVISIONING, lastError: null },
    create: {
      phoneNumberId: input.vobizNumber.id,
      status: ProvisioningStatus.PROVISIONING,
    },
  });

  const existingVobizOutbound = await findVobizTrunk({
    name: outboundTrunkName,
    direction: "outbound",
  });
  const existingVobizInbound = await findVobizTrunk({
    name: inboundTrunkName,
    direction: "inbound",
  });

  // Step 1: ensure Vobiz SIP credential
  let vobizCredentialId = input.vobizCredentialId;
  let vobizCredentialPassword: string | undefined;
  let vobizCredentialUsername: string | undefined;
  let vobizCredentialRaw: unknown = null;

  if (!vobizCredentialId && (!existingVobizOutbound || !existingVobizInbound)) {
    const cred = await createVobizCredential({ name: `auto-${Date.now()}` });
    vobizCredentialRaw = cred;
    const created = cred as { id: string; username: string; password?: string };
    if (!created?.id) throw new Error(`Vobiz credential creation returned no id: ${JSON.stringify(cred)}`);
    vobizCredentialId = created.id;
    vobizCredentialPassword = created.password;
    vobizCredentialUsername = created.username;
  } else {
    // Fetch existing credential password is not possible — operator must supply the ID
    // whose password is already known. Skip re-fetch.
    vobizCredentialUsername = undefined;
  }

  // Step 2: Create Vobiz outbound trunk (→ Vobiz for outbound calls)
  const outboundTrunk = existingVobizOutbound ?? await createVobizTrunk({
    name: outboundTrunkName,
    credentialsId: vobizCredentialId!,
    trunkDirection: "outbound",
  });
  const vobizOutboundData = outboundTrunk as { trunk_id: string; trunk_domain?: string };
  if (!vobizOutboundData?.trunk_id) throw new Error(`Vobiz outbound trunk creation returned no trunk_id: ${JSON.stringify(outboundTrunk)}`);

  // Step 3: Create Vobiz inbound trunk (← Vobiz for inbound calls)
  const inboundTrunk = existingVobizInbound ?? await createVobizTrunk({
    name: inboundTrunkName,
    credentialsId: vobizCredentialId!,
    trunkDirection: "inbound",
  });
  const vobizInboundData = inboundTrunk as { trunk_id: string };
  if (!vobizInboundData?.trunk_id) throw new Error(`Vobiz inbound trunk creation returned no trunk_id: ${JSON.stringify(inboundTrunk)}`);
  const inboundTrunkId = vobizInboundData.trunk_id;

  // Steps 4 & 5: Create LiveKit trunks — reuse existing if already set up for this number
  let livekitOutbound = await findLiveKitOutboundTrunkByNumber(input.vobizNumber.e164);
  if (!livekitOutbound) {
    livekitOutbound = await createLiveKitOutboundTrunk({
      name: `${trunkName} (Outbound)`,
      vobizSipDomain: vobizOutboundData.trunk_domain ?? "",
      vobizUsername: vobizCredentialUsername ?? "",
      vobizPassword: vobizCredentialPassword ?? "",
      numbers: [input.vobizNumber.e164],
    });
    if (!livekitOutbound?.sipTrunkId) throw new Error(`LiveKit outbound trunk creation returned no sipTrunkId: ${JSON.stringify(livekitOutbound)}`);
  } else {
    // Trunk already exists for this number — validate it has a sipTrunkId
    if (!livekitOutbound.sipTrunkId) throw new Error(`Existing LiveKit outbound trunk has no sipTrunkId: ${JSON.stringify(livekitOutbound)}`);
  }

  let livekitInbound = await findLiveKitInboundTrunkByNumber(input.vobizNumber.e164);
  if (!livekitInbound) {
    livekitInbound = await createLiveKitInboundTrunk({
      name: `${trunkName} (Inbound)`,
      numbers: [input.vobizNumber.e164],
    });
    if (!livekitInbound?.sipTrunkId) throw new Error(`LiveKit inbound trunk creation returned no sipTrunkId: ${JSON.stringify(livekitInbound)}`);
  } else {
    // Trunk already exists for this number — validate it has a sipTrunkId
    if (!livekitInbound.sipTrunkId) throw new Error(`Existing LiveKit inbound trunk has no sipTrunkId: ${JSON.stringify(livekitInbound)}`);
  }

  // Step 6: Update Vobiz inbound trunk to forward to the LiveKit project SIP endpoint.
  await setVobizTrunkInboundDestination(inboundTrunkId, livekitSipEndpoint);

  // Step 8: Create or reuse LiveKit dispatch rule for this inbound trunk
  const existingRules = await findSipDispatchRulesByTrunkId(livekitInbound.sipTrunkId);
  let dispatchRule = existingRules[0] ?? null;
  if (!dispatchRule) {
    dispatchRule = await createLiveKitDispatchRule({
      name: `${trunkName} (Dispatch)`,
      rule: {
        type: "individual",
        roomPrefix: `call-${input.agent.agentId}-`,
      },
      trunkIds: [livekitInbound.sipTrunkId],
      metadata,
    });
  } else if (!hasDispatchRuleMetadata(dispatchRule, metadata)) {
    dispatchRule = await updateLiveKitDispatchRuleMetadata({
      dispatchRule,
      metadata,
    });
  }
  if (!dispatchRule?.sipDispatchRuleId) throw new Error(`LiveKit dispatch rule creation returned no sipDispatchRuleId: ${JSON.stringify(dispatchRule)}`);

  // Step 9: Persist to DB — update PhoneNumber ownership and connection resource IDs
  const updated = await prisma.phoneNumber.update({
    where: { id: input.vobizNumber.id },
    data: { agentId: input.agent.id },
  });

  const updatedConnection = await prisma.phoneNumberConnection.update({
    where: { id: connection.id },
    data: {
      status: ProvisioningStatus.ACTIVE,
      lastError: null,
      vobizCredentialId,
      vobizInboundTrunkId: inboundTrunkId,
      vobizOutboundTrunkId: vobizOutboundData.trunk_id,
      vobizInboundDomain: (vobizInboundData as { trunk_domain?: string }).trunk_domain ?? null,
      vobizOutboundDomain: vobizOutboundData.trunk_domain ?? null,
      livekitInboundTrunkId: livekitInbound.sipTrunkId,
      livekitOutboundTrunkId: livekitOutbound.sipTrunkId,
      livekitDispatchRuleId: dispatchRule.sipDispatchRuleId,
      livekitSipEndpoint,
      rawVobizInboundTrunk: JSON.parse(JSON.stringify(inboundTrunk)),
      rawVobizOutboundTrunk: JSON.parse(JSON.stringify(outboundTrunk)),
      rawVobizCredential: vobizCredentialRaw
        ? JSON.parse(JSON.stringify(vobizCredentialRaw))
        : undefined,
      rawLiveKitInboundTrunk: JSON.parse(JSON.stringify(livekitInbound)),
      rawLiveKitOutboundTrunk: JSON.parse(JSON.stringify(livekitOutbound)),
      rawLiveKitDispatchRule: JSON.parse(JSON.stringify(dispatchRule)),
    },
  });

  return {
    phoneNumberId: updated.id,
    connectionId: updatedConnection.id,
    livekitInboundTrunkId: livekitInbound.sipTrunkId,
    livekitOutboundTrunkId: livekitOutbound.sipTrunkId,
    livekitDispatchRuleId: dispatchRule.sipDispatchRuleId,
  };
}
