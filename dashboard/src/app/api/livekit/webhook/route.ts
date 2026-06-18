import { WebhookReceiver } from "livekit-server-sdk";
import { NextResponse, type NextRequest } from "next/server";

import { CallStatus, CallType } from "@/generated/prisma/client";
import { requireLiveKitEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const livekit = requireLiveKitEnv();
    const body = await request.text();
    const authorization = request.headers.get("authorization") || "";
    const receiver = new WebhookReceiver(livekit.apiKey, livekit.apiSecret);
    const event = await receiver.receive(body, authorization);
    const roomName = event.room?.name;
    const participantIdentity = event.participant?.identity;
    const participantKind = event.participant?.kind === 3 ? "SIP" : event.participant?.kind === 4 ? "AGENT" : "OTHER";

    console.log(
      `[webhook] ${event.event} room=${roomName ?? "?"} participant=${participantIdentity ?? "?"} kind=${participantKind} eventId=${event.id ?? "?"}`,
    );

    // Resolve the Call record.
    let callId: string | null = null;

    if (roomName) {
      if (event.event === "room_started") {
        callId = await ensureCallForRoom(roomName);
        console.log(`[webhook] room_started ensureCallForRoom → callId=${callId ?? "null"}`);
      } else {
        // Primary: look up by room name.
        const call = await prisma.call.findUnique({
          where: { roomName },
          select: { id: true },
        });
        callId = call?.id ?? null;

        // Fallback: for SIP participants, look up by SIP identifiers.
        // This handles room name mismatches when the agent's room name
        // differs slightly from the workflow-created room name.
        if (!callId && event.participant?.kind === 3) {
          const attrs = event.participant?.attributes ?? {};
          const sipCallId = attrs["sip.callID"];
          if (sipCallId) {
            console.log(`[webhook] room lookup failed, trying SIP fallback sipCallId=${sipCallId}`);
            const call = await prisma.call.findFirst({
              where: {
                livekitSipCallId: sipCallId,
                createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
              },
              select: { id: true, roomName: true },
            });
            if (call) {
              callId = call.id;
              console.log(`[webhook] SIP fallback found callId=${callId}, patching roomName ${call.roomName} → ${roomName}`);
              // Update the Call's roomName to match the actual LiveKit room.
              if (roomName !== call.roomName) {
                await prisma.call.update({
                  where: { id: call.id },
                  data: { roomName },
                });
              }
            } else {
              console.log(`[webhook] SIP fallback also failed, event dropped`);
            }
          }
        }
      }
    }

    if (!callId) {
      console.log(`[webhook] no callId resolved for room=${roomName ?? "?"}, event dropped`);
    }

    // Persist the raw event (idempotent — eventId is unique).
    if (callId && event.id) {
      await prisma.webhookEvent.upsert({
        where: { eventId: event.id },
        create: {
          eventId: event.id,
          callId,
          eventType: event.event,
          participantSid: event.participant?.sid,
          participantIdentity: event.participant?.identity,
          participantKind: kindToString(event.participant?.kind),
          trackSid: event.track?.sid,
          trackType: trackTypeToString(event.track?.type),
          trackSource: trackSourceToString(event.track?.source),
          rawData: JSON.parse(body),
          occurredAt: event.createdAt ? new Date(Number(event.createdAt) * 1000) : new Date(),
        },
        update: {}, // duplicate delivery — no-op
      });
    }

    // Update Call status for lifecycle events.
    if (roomName && callId) {
      if (event.event === "room_started") {
        // For web sessions (QUEUED → ACTIVE). For SIP calls the status is
        // already DIALING; we'll transition to ACTIVE on participant_joined.
        const call = await prisma.call.findUnique({
          where: { id: callId },
          select: { status: true },
        });
        if (call?.status === CallStatus.QUEUED) {
          console.log(`[webhook] ${callId} QUEUED → ACTIVE (room_started, web session)`);
          await prisma.call.update({
            where: { id: callId },
            data: { status: CallStatus.ACTIVE },
          });
        } else {
          console.log(`[webhook] ${callId} room_started but status is ${call?.status}, skipping transition`);
        }
        // Set startedAt only if not already set (idempotent).
        await prisma.$executeRaw`
          UPDATE Call SET startedAt = COALESCE(startedAt, datetime('now'))
          WHERE id = ${callId} AND startedAt IS NULL
        `;
      }

      if (event.event === "room_finished") {
        // Only set COMPLETED if not already in a terminal state.
        console.log(`[webhook] ${callId} room_finished, ensuring terminal state`);
        await prisma.call.updateMany({
          where: {
            id: callId,
            status: { notIn: [CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.NO_ANSWER, CallStatus.BUSY, CallStatus.DECLINED] },
          },
          data: { status: CallStatus.COMPLETED, endedAt: new Date() },
        });
      }

      // SIP participant joined = call answered. When a SIP participant's
      // media connection is established, the call is live. Always set ACTIVE
      // regardless of sip.callStatus (the attribute may not be "active" yet
      // at join time — it transitions via a separate attribute change event).
      if (event.event === "participant_joined") {
        const isSip = event.participant?.kind === 3; // ParticipantKind.SIP
        if (isSip) {
          console.log(`[webhook] ${callId} SIP participant joined → ACTIVE`);
          await prisma.call.update({
            where: { id: callId },
            data: { status: CallStatus.ACTIVE, startedAt: new Date() },
          });
          const attrs = event.participant?.attributes ?? {};
          const sipCallIdFull = attrs["sip.callIDFull"];
          if (sipCallIdFull) {
            await prisma.$executeRaw`
              UPDATE Call SET metadata = json_set(
                COALESCE(metadata, '{}'),
                '$.sip_call_id_full',
                ${sipCallIdFull}
              )
              WHERE id = ${callId}
            `;
          }
        }
      }

      // SIP participant left = call ended or failed. Map disconnect reason
      // to a terminal CallStatus. The current status determines whether
      // SIP_TRUNK_FAILURE means a true failure (pre-connection) or a
      // post-connection issue (treated as COMPLETED).
      if (event.event === "participant_left") {
        const isSip = event.participant?.kind === 3;
        if (isSip) {
          const terminalStatuses: CallStatus[] = [
            CallStatus.COMPLETED,
            CallStatus.FAILED,
            CallStatus.NO_ANSWER,
            CallStatus.BUSY,
            CallStatus.DECLINED,
          ];
          const current = await prisma.call.findUnique({
            where: { id: callId },
            select: { status: true, startedAt: true },
          });

          if (current && !terminalStatuses.includes(current.status)) {
            const reason = event.participant?.disconnectReason as string | undefined;
            const newStatus = mapDisconnectReason(reason, current.status);
            const endedAt = new Date();
            const durationMs = current.startedAt
              ? Math.max(0, endedAt.getTime() - current.startedAt.getTime())
              : null;
            console.log(`[webhook] ${callId} SIP participant left: reason=${reason ?? "?"} ${current.status} → ${newStatus} duration=${durationMs ?? "?"}ms`);

            await prisma.call.update({
              where: { id: callId },
              data: {
                status: newStatus,
                endedAt,
                ...(durationMs != null ? { durationMs } : {}),
              },
            });
          } else {
            console.log(`[webhook] ${callId} SIP participant left but already terminal (${current?.status}), skipping`);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("LiveKit webhook error:", error);
    return NextResponse.json({ error: "Invalid LiveKit webhook" }, { status: 400 });
  }
}

/**
 * Resolve a Call for the given room, creating it for inbound calls if needed.
 * Returns null for rooms that don't match any known call or agent pattern.
 * This prevents creating phantom Call records for outbound calls whose
 * createCallRecord step hasn't committed yet when room_started arrives.
 */
async function ensureCallForRoom(roomName: string): Promise<string | null> {
  const existing = await prisma.call.findUnique({
    where: { roomName },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Only create a Call for rooms that match an agent's inbound pattern
  // (call-{agentId}-{timestamp}). Unrecognized rooms are ignored — they're
  // likely outbound calls whose workflow hasn't committed yet.
  const agent = await findAgentForInboundRoom(roomName);
  if (!agent) return null;

  const call = await prisma.call.create({
    data: {
      type: CallType.INBOUND,
      status: CallStatus.ACTIVE,
      roomName,
      agentId: agent.id,
      startedAt: new Date(),
      metadata: { inferred_from_room_name: true, agent_id: agent.agentId },
    },
    select: { id: true },
  });
  return call.id;
}

async function findAgentForInboundRoom(roomName: string) {
  if (!roomName.startsWith("call-")) return null;

  const agents = await prisma.agent.findMany({ select: { id: true, agentId: true } });
  return agents.find((agent) => roomName.startsWith(`call-${agent.agentId}-`)) ?? null;
}

function kindToString(kind: number | undefined): string | undefined {
  if (kind === undefined) return undefined;
  const map: Record<number, string> = {
    0: "STANDARD",
    1: "INGRESS",
    2: "EGRESS",
    3: "SIP",
    4: "AGENT",
    7: "CONNECTOR",
    8: "BRIDGE",
  };
  return map[kind] ?? String(kind);
}

function trackTypeToString(type: number | undefined): string | undefined {
  if (type === undefined) return undefined;
  const map: Record<number, string> = { 0: "AUDIO", 1: "VIDEO", 2: "DATA" };
  return map[type] ?? String(type);
}

function trackSourceToString(source: number | undefined): string | undefined {
  if (source === undefined) return undefined;
  const map: Record<number, string> = {
    0: "UNKNOWN",
    1: "CAMERA",
    2: "MICROPHONE",
    3: "SCREEN_SHARE",
    4: "SCREEN_SHARE_AUDIO",
  };
  return map[source] ?? String(source);
}

/**
 * Map a LiveKit SIP participant disconnect reason to a terminal CallStatus.
 *
 * LiveKit disconnect reasons for outbound SIP:
 *   CLIENT_INITIATED — normal hangup after call connected
 *   USER_REJECTED    — callee actively rejected (SIP 486 or 603)
 *   USER_UNAVAILABLE — no answer / timeout (SIP 408 or 480)
 *   SIP_TRUNK_FAILURE — trunk or protocol error (SIP 5xx)
 *   ROOM_DELETED     — room was programmatically deleted
 *
 * currentStatus determines the interpretation of SIP_TRUNK_FAILURE:
 *   If the call was never ACTIVE (still DIALING/RINGING), it's a real FAILED.
 *   If the call was ACTIVE, the trunk error happened mid-call — treat as COMPLETED.
 */
function mapDisconnectReason(
  reason: string | undefined,
  currentStatus: CallStatus,
): CallStatus {
  switch (reason) {
    case "CLIENT_INITIATED":
      return CallStatus.COMPLETED;
    case "USER_REJECTED":
      return CallStatus.BUSY;
    case "USER_UNAVAILABLE":
      return CallStatus.NO_ANSWER;
    case "SIP_TRUNK_FAILURE":
      // Pre-connection trunk failure = real failure.
      // Post-connection trunk issue = call was live, treat as completed.
      return currentStatus === CallStatus.ACTIVE
        ? CallStatus.COMPLETED
        : CallStatus.FAILED;
    case "ROOM_DELETED":
      return CallStatus.COMPLETED;
    default:
      return CallStatus.COMPLETED;
  }
}
