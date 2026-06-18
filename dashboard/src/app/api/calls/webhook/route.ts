import { NextResponse, type NextRequest } from "next/server";

import { CallStatus, CallType, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type CompletionPayload = {
  agent_id?: unknown;
  agent_type?: unknown;
  room_name?: unknown;
  roomName?: unknown;
  session_id?: unknown;
  sessionId?: unknown;
  audio_url?: unknown;
  video_url?: unknown;
  transcript_url?: unknown;
  verbose_url?: unknown;
  duration_ms?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
  status?: unknown;
  transcript?: unknown;
  phone_number?: unknown;
  livekit_job_id?: unknown;
  job_id?: unknown;
};

export async function POST(request: NextRequest) {
  if (env.CALL_WEBHOOK_SECRET) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token !== env.CALL_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = (await request.json()) as CompletionPayload;
  const roomName = stringValue(payload.room_name) || stringValue(payload.roomName);
  const sessionId = stringValue(payload.session_id) || stringValue(payload.sessionId);

  if (!roomName && !sessionId) {
    return NextResponse.json(
      { error: "Missing room_name or session_id" },
      { status: 400 },
    );
  }

  const existingCall = sessionId
    ? await prisma.call.findUnique({ where: { id: sessionId } })
    : roomName
      ? await prisma.call.findUnique({ where: { roomName } })
      : null;
  const call = existingCall ?? (roomName
    ? await prisma.call.findUnique({ where: { roomName } })
    : null);

  const transcript = isJsonObject(payload.transcript) ? payload.transcript : undefined;
  const transcriptSession = isJsonObject(transcript?.session)
    ? transcript.session
    : undefined;
  const transcriptSubject = isJsonObject(transcript?.subject)
    ? transcript.subject
    : undefined;
  const startedAt = parseDate(payload.started_at) ?? parseDate(transcriptSession?.started_at);
  const endedAt = parseDate(payload.ended_at) ?? parseDate(transcriptSession?.ended_at) ?? new Date();
  const status = stringValue(payload.status) ? mapCompletionStatus(stringValue(payload.status)) : undefined;
  const phoneNumber =
    stringValue(payload.phone_number) || stringValue(transcriptSubject?.phone_number);

  const data: Record<string, unknown> = {
    ...(status != null ? { status } : {}),
    audioUrl: stringValue(payload.audio_url),
    videoUrl: stringValue(payload.video_url),
    transcriptUrl: stringValue(payload.transcript_url),
    verboseUrl: stringValue(payload.verbose_url),
    livekitJobId: stringValue(payload.livekit_job_id) || stringValue(payload.job_id) || stringValue(transcriptSession?.job_id),
    durationMs: numberValue(payload.duration_ms),
    transcript: toJsonValue(transcript),
    sessionPayload: toJsonValue(payload),
    startedAt: startedAt ?? call?.startedAt ?? undefined,
    endedAt,
  };

  if (call) {
    const updated = await prisma.call.update({
      where: { id: call.id },
      data,
    });
    return NextResponse.json({ success: true, callId: updated.id });
  }

  const agentId = stringValue(payload.agent_id);
  if (!agentId || !roomName) {
    return NextResponse.json(
      { error: "Call not found and payload cannot create one" },
      { status: 404 },
    );
  }

  const agent = await prisma.agent.findUnique({ where: { agentId } });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const phone = phoneNumber
    ? await prisma.phoneNumber.findUnique({ where: { e164: phoneNumber } })
    : null;

  const created = await prisma.call.create({
    data: {
      type: CallType.INBOUND,
      roomName,
      fromNumber: phoneNumber ?? null,
      agentId: agent.id,
      phoneNumberId: phone?.id ?? null,
      metadata: {
        agent_id: agentId,
        agent_type: stringValue(payload.agent_type),
      },
      ...data,
    },
  });

  return NextResponse.json({ success: true, callId: created.id });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function parseDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapCompletionStatus(status?: string): CallStatus {
  if (!status) return CallStatus.COMPLETED;
  const normalized = status.toUpperCase().replace(/[\s-]+/g, "_");
  const validStatuses: Record<string, CallStatus> = {
    COMPLETED: CallStatus.COMPLETED,
    FAILED: CallStatus.FAILED,
    NO_ANSWER: CallStatus.NO_ANSWER,
    BUSY: CallStatus.BUSY,
    DECLINED: CallStatus.DECLINED,
  };
  return validStatuses[normalized] ?? CallStatus.COMPLETED;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
