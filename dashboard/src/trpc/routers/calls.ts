import { CallStatus, CallType } from "@/generated/prisma/client";
import { start } from "workflow/api";
import { z } from "zod";

import { env, getCallWebhookUrl } from "@/lib/env";
import { buildAgentMetadata, createAgentDispatch, deleteLiveKitRoom } from "@/lib/livekit";
import { prisma } from "@/lib/prisma";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { dialPlaygroundNumberWorkflow } from "@/workflows/dial-playground-number";

const e164Schema = z.string().regex(/^\+\d{8,15}$/, "Use E.164 format, e.g. +918071387149");

function createRoomName() {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Derived session health from webhook events.
 * Answers the five questions the ops team asks about a call:
 *   1. Did the agent connect?
 *   2. Did the user connect?
 *   3. Did audio exchange happen?
 *   4. When did it start/end?
 *   5. Why did it end?
 */
type SessionParticipant = {
  identity: string;
  kind: string;
  joinedAt: string | null;
  leftAt: string | null;
  publishedAudio: boolean;
  publishedVideo: boolean;
  connectionAborted: boolean;
};

type SessionSummary = {
  participants: SessionParticipant[];
  roomStartedAt: string | null;
  roomFinishedAt: string | null;
  endedNormally: boolean;
};

function buildSessionSummary(
  events: Array<{
    eventType: string;
    participantSid: string | null;
    participantIdentity: string | null;
    participantKind: string | null;
    trackType: string | null;
    trackSource: string | null;
    occurredAt: Date;
  }>,
): SessionSummary {
  const bySid = new Map<string, SessionParticipant>();
  let roomStartedAt: string | null = null;
  let roomFinishedAt: string | null = null;

  for (const ev of events) {
    switch (ev.eventType) {
      case "room_started":
        roomStartedAt = ev.occurredAt.toISOString();
        break;
      case "room_finished":
        roomFinishedAt = ev.occurredAt.toISOString();
        break;
      case "participant_joined": {
        const sid = ev.participantSid ?? ev.participantIdentity ?? "unknown";
        const existing = bySid.get(sid);
        if (existing) {
          existing.joinedAt = ev.occurredAt.toISOString();
        } else {
          bySid.set(sid, {
            identity: ev.participantIdentity ?? sid,
            kind: ev.participantKind ?? "STANDARD",
            joinedAt: ev.occurredAt.toISOString(),
            leftAt: null,
            publishedAudio: false,
            publishedVideo: false,
            connectionAborted: false,
          });
        }
        break;
      }
      case "participant_left": {
        const sid = ev.participantSid ?? ev.participantIdentity ?? "unknown";
        const p = bySid.get(sid);
        if (p) p.leftAt = ev.occurredAt.toISOString();
        break;
      }
      case "participant_connection_aborted": {
        const sid = ev.participantSid ?? ev.participantIdentity ?? "unknown";
        const p = bySid.get(sid);
        if (p) p.connectionAborted = true;
        break;
      }
      case "track_published": {
        const sid = ev.participantSid ?? ev.participantIdentity ?? "unknown";
        const p = bySid.get(sid);
        if (p) {
          if (ev.trackType === "AUDIO") p.publishedAudio = true;
          if (ev.trackType === "VIDEO") p.publishedVideo = true;
        }
        break;
      }
    }
  }

  return {
    participants: [...bySid.values()],
    roomStartedAt,
    roomFinishedAt,
    endedNormally: roomFinishedAt !== null,
  };
}

export const callsRouter = createTRPCRouter({
  /**
   * Mark ACTIVE calls that have been open for longer than the threshold
   * as FAILED. This catches rooms that leaked due to agent crashes or
   * missing room_finished webhooks.
   *
   * Default threshold: 2 hours. Calls older than this with ACTIVE status
   * and no terminal webhook events are assumed stale.
   */
  cleanupStaleCalls: baseProcedure
    .input(z.object({ thresholdMs: z.number().int().default(2 * 60 * 60 * 1000) }).optional())
    .mutation(async ({ input }) => {
      const threshold = input?.thresholdMs ?? 2 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - threshold);

      const staleCalls = await prisma.call.findMany({
        where: {
          status: { in: [CallStatus.ACTIVE, CallStatus.DIALING, CallStatus.RINGING] },
          createdAt: { lt: cutoff },
        },
        select: { id: true, roomName: true, status: true, createdAt: true },
      });

      if (staleCalls.length === 0) {
        return { cleaned: 0, calls: [] };
      }

      const ids = staleCalls.map((c) => c.id);
      await prisma.call.updateMany({
        where: { id: { in: ids } },
        data: {
          status: CallStatus.FAILED,
          errorMessage: "Stale session — no room_finished webhook received",
          endedAt: new Date(),
        },
      });

      return {
        cleaned: staleCalls.length,
        calls: staleCalls.map((c) => ({
          id: c.id,
          roomName: c.roomName,
          previousStatus: c.status,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    }),
  list: baseProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.array(z.string()).optional(),
          agentId: z.string().optional(),
          type: z.enum(["web", "sip"]).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          sortBy: z.enum(["createdAt", "durationMs", "status"]).optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 50;
      const sortBy = input?.sortBy ?? "createdAt";
      const sortDir = input?.sortDir ?? "desc";

      const where: Record<string, unknown> = {};

      // Status filter
      if (input?.status && input.status.length > 0) {
        where.status = { in: input.status };
      }

      // Agent filter
      if (input?.agentId) {
        where.agentId = input.agentId;
      }

      // Type filter
      if (input?.type === "sip") {
        where.OR = [
          { toNumber: { not: null } },
          { fromNumber: { not: null } },
        ];
      } else if (input?.type === "web") {
        where.AND = [
          { toNumber: null },
          { fromNumber: null },
        ];
      }

      // Date range
      if (input?.from || input?.to) {
        where.createdAt = {};
        if (input.from) (where.createdAt as Record<string, Date>).gte = new Date(input.from);
        if (input.to) (where.createdAt as Record<string, Date>).lte = new Date(input.to + "T23:59:59.999Z");
      }

      // Text search (room name, ID, agent name, phone numbers)
      if (input?.search) {
        const s = input.search;
        where.OR = [
          { roomName: { contains: s } },
          { id: { contains: s } },
          { toNumber: { contains: s } },
          { fromNumber: { contains: s } },
          { agent: { name: { contains: s } } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.call.findMany({
          where,
          include: { agent: true, phoneNumber: { include: { connection: true } } },
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.call.count({ where }),
      ]);

      return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }),
  byId: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      prisma.call.findUniqueOrThrow({
        where: { id: input.id },
        include: { agent: true, phoneNumber: { include: { connection: true } } },
      }),
    ),
  events: baseProcedure
    .input(z.object({ callId: z.string() }))
    .query(({ input }) =>
      prisma.webhookEvent.findMany({
        where: { callId: input.callId },
        orderBy: { occurredAt: "asc" },
      }),
    ),
  sessionSummary: baseProcedure
    .input(z.object({ callId: z.string() }))
    .query(async ({ input }) => {
      const events = await prisma.webhookEvent.findMany({
        where: { callId: input.callId },
        select: {
          eventType: true,
          participantSid: true,
          participantIdentity: true,
          participantKind: true,
          trackType: true,
          trackSource: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
      });
      return buildSessionSummary(events);
    }),

  createPlaygroundCall: baseProcedure
    .input(
      z.object({
        agentId: z.string(),
        phoneNumberId: z.string().optional(),
        toNumber: e164Schema.optional(),
        toNumbers: z.array(e164Schema).default([]),
        userId: z.string().optional(),
        roomName: z.string().optional(),
        dial: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const toNumbers = [...new Set(input.toNumbers.length ? input.toNumbers : input.toNumber ? [input.toNumber] : [])];

      if (input.dial) {
        if (toNumbers.length === 0) {
          throw new Error("At least one toNumber is required when dial is true.");
        }

        const runs = await Promise.all(
          toNumbers.map((toNumber) =>
            start(dialPlaygroundNumberWorkflow, [
              {
                agentId: input.agentId,
                phoneNumberId: input.phoneNumberId || undefined,
                toNumber,
                userId: input.userId || undefined,
                webhookUrl: getCallWebhookUrl(ctx.headers),
                webhookSecret: env.CALL_WEBHOOK_SECRET,
              },
            ]),
          ),
        );

        return { started: runs.length, toNumbers };
      }

      const agent = await prisma.agent.findUniqueOrThrow({
        where: { id: input.agentId },
      });
      const phoneNumber = input.phoneNumberId
        ? await prisma.phoneNumber.findUniqueOrThrow({
            where: { id: input.phoneNumberId },
            include: { connection: true },
          })
        : null;
      const initialMetadata = buildAgentMetadata(agent, {
        userId: input.userId,
        interactionMode: "auto",
      });
      const roomName = input.roomName || createRoomName();
      const call = await prisma.call.create({
        data: {
          type: CallType.PLAYGROUND,
          status: CallStatus.QUEUED,
          roomName,
          toNumber: null,
          fromNumber: phoneNumber?.e164 ?? null,
          agentId: agent.id,
          phoneNumberId: phoneNumber?.id ?? null,
          metadata: JSON.parse(initialMetadata),
        },
      });
      const metadata = buildAgentMetadata(agent, {
        userId: input.userId,
        sessionId: call.id,
        interactionMode: "auto",
        webhookUrl: getCallWebhookUrl(ctx.headers),
        webhookSecret: env.CALL_WEBHOOK_SECRET,
      });
      await prisma.call.update({
        where: { id: call.id },
        data: { metadata: JSON.parse(metadata) },
      });

      try {
        const dispatch = await createAgentDispatch({ roomName, metadata });
        const livekitDispatchId =
          (dispatch as { id?: string; dispatchId?: string }).id ||
          (dispatch as { id?: string; dispatchId?: string }).dispatchId ||
          null;

        const updated = await prisma.call.update({
          where: { id: call.id },
          data: { livekitDispatchId, status: CallStatus.ACTIVE, startedAt: new Date() },
        });
        return { started: 1, toNumbers: [], callId: updated.id, roomName: updated.roomName };
      } catch (error) {
        const updated = await prisma.call.update({
          where: { id: call.id },
          data: {
            status: CallStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : "Unknown call error",
            endedAt: new Date(),
          },
        });
        return { started: 0, toNumbers: [], callId: updated.id, roomName: updated.roomName };
      }
    }),

  /**
   * End an active call by deleting the LiveKit room.
   * This triggers the agent's on_session_end() which posts the completion
   * webhook with transcript, recordings, etc.
   */
  hangup: baseProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ input }) => {
      const call = await prisma.call.findUniqueOrThrow({
        where: { id: input.callId },
        select: { id: true, roomName: true, status: true },
      });

      const inFlight = new Set(["QUEUED", "DIALING", "RINGING", "ACTIVE"]);
      if (!inFlight.has(call.status)) {
        return { success: false, reason: "Call already ended" };
      }

      try {
        await deleteLiveKitRoom(call.roomName);
        return { success: true };
      } catch (error) {
        // Room may already be gone — treat as success
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("not found") || msg.includes("NOT_FOUND")) {
          return { success: true, reason: "Room already deleted" };
        }
        throw error;
      }
    }),
});
