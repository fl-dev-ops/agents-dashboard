"use client";

import { useQuery } from "@tanstack/react-query";
import {
  IconExternalLink,
  IconFileText,
  IconMicrophone,
  IconPhoto,
  IconPlayerPlay,
  IconRobot,
  IconTimeline,
  IconUser,
  IconVideo,
  IconWifiOff,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Transcript } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { DashboardCall } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TranscriptTurn = {
  index?: number;
  role?: string;
  text?: string;
  timestamp?: Date | string;
  interrupted?: boolean;
};

const TAB_VALUES = ["overview", "events", "artifacts"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TABS: { value: TabValue; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "events", label: "Events" },
  { value: "artifacts", label: "Artifacts" },
];

function normalizeTab(value: string | null): TabValue {
  if (value && (TAB_VALUES as readonly string[]).includes(value)) return value as TabValue;
  return "overview";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeTab(searchParams.get("tab"));

  const trpc = useTRPC();
  const IN_FLIGHT = new Set(["QUEUED", "DIALING", "RINGING"]);
  const call = useQuery({
    ...trpc.calls.byId.queryOptions({ id }),
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      return data?.status && IN_FLIGHT.has(data.status) ? 5_000 : 30_000;
    },
  });
  const session = useQuery({
    ...trpc.calls.sessionSummary.queryOptions({ callId: id }),
    enabled: call.isSuccess,
  });
  const events = useQuery({
    ...trpc.calls.events.queryOptions({ callId: id }),
    enabled: call.isSuccess,
  });

  const setActiveTab = (tab: TabValue) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (call.isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (call.isError || !call.data) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconFileText /></EmptyMedia>
          <EmptyTitle>Call not found</EmptyTitle>
          <EmptyDescription>The call record is no longer available.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/calls" className={buttonVariants({ variant: "outline" })}>
            Back to calls
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  const data = call.data as DashboardCall;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Session detail"
        title={<span className="font-mono">{data.roomName}</span>}
        description={data.startedAt ? `Started ${formatDistanceToNow(new Date(data.startedAt), { addSuffix: true })}` : "Not yet started"}
        actions={
          <Badge
            variant={
              data.status === "FAILED" || data.status === "DECLINED"
                ? "destructive"
                : data.status === "COMPLETED"
                  ? "default"
                  : data.status === "NO_ANSWER" || data.status === "BUSY"
                    ? "outline"
                    : "secondary"
            }
            className="text-[11px]"
          >
            {data.status}
          </Badge>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/calls" />}>Calls</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono text-xs">{data.roomName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="overflow-x-auto border-b" role="tablist" aria-label="Call sections">
          <div className="flex min-w-max gap-5">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                className="border-b-2 border-transparent px-0.5 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {activeTab === "overview" && <OverviewTab data={data} session={session.data ?? null} />}
          {activeTab === "events" && <EventsTab events={events.data ?? null} isLoading={events.isLoading} callStartedAt={data.startedAt} />}
          {activeTab === "artifacts" && <ArtifactsTab data={data} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview — recording + transcript + session sidebar
// ---------------------------------------------------------------------------

function OverviewTab({
  data,
  session,
}: {
  data: DashboardCall;
  session: {
    participants: Array<{
      identity: string;
      kind: string;
      joinedAt: string | null;
      leftAt: string | null;
      publishedAudio: boolean;
      publishedVideo: boolean;
      connectionAborted: boolean;
    }>;
    roomStartedAt: string | null;
    roomFinishedAt: string | null;
    endedNormally: boolean;
  } | null;
}) {
  const turns = extractTurns(data.transcript);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        {/* Transcript */}
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Transcript</h2>
              <p className="mt-1 text-sm text-muted-foreground">{turns.length} turn{turns.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="p-4">
            <Transcript turns={turns} sessionStart={data.startedAt ?? undefined} />
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">Call state and participants.</p>
          <div className="mt-5 space-y-3 text-sm">
            <Meta label="Agent" value={data.agent?.name ?? "—"} />
            <Meta label="From" value={data.fromNumber ?? "—"} />
            <Meta label="To" value={data.toNumber ?? "—"} />
            <Meta label="Started" value={data.startedAt ? formatDate(data.startedAt) : "—"} />
            <Meta label="Completed" value={data.endedAt ? formatDate(data.endedAt) : "—"} />
            <Meta label="Duration" value={formatDuration(data.durationMs)} />
          </div>
        </div>

        {session && session.participants.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">Participants</h3>
            <div className="space-y-3">
              {session.participants.map((p) => (
                <ParticipantStatus key={p.identity} participant={p} callStartedAt={data.startedAt} />
              ))}
            </div>
            {session.participants.some((p) => p.connectionAborted) && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <IconWifiOff className="mt-0.5 size-3.5 shrink-0" />
                <span>A participant connection was aborted — media never established.</span>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Events — full webhook event list
// ---------------------------------------------------------------------------

function EventsTab({
  events,
  isLoading,
  callStartedAt,
}: {
  events: Array<{
    id: string;
    eventType: string;
    participantSid: string | null;
    participantIdentity: string | null;
    participantKind: string | null;
    trackSid: string | null;
    trackType: string | null;
    trackSource: string | null;
    occurredAt: Date | string;
  }> | null;
  isLoading: boolean;
  callStartedAt?: Date | string | null;
}) {
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <IconTimeline className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Events</h2>
        </div>
        <div className="border-t p-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No events captured yet. Events appear as the session progresses.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <IconTimeline className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Events</h2>
        </div>
        <span className="text-xs text-muted-foreground">{events.length} event{events.length === 1 ? "" : "s"}</span>
      </div>
      <div className="divide-y">
        {events.map((ev) => (
          <div key={ev.id} className="flex items-start gap-4 px-4 py-3">
            <div className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
              {ev.occurredAt ? formatRelativeTime(ev.occurredAt, callStartedAt ?? ev.occurredAt) : "—"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <EventBadge eventType={ev.eventType} />
                {ev.participantIdentity && (
                  <span className="truncate text-sm text-foreground">{ev.participantIdentity}</span>
                )}
              </div>
              {(ev.trackType || ev.trackSource) && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {ev.trackType && <span>{ev.trackType}</span>}
                  {ev.trackSource && ev.trackSource !== "UNKNOWN" && <span>· {ev.trackSource}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventBadge({ eventType }: { eventType: string }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    eventType === "room_started" || eventType === "participant_joined"
      ? "default"
      : eventType === "room_finished" || eventType === "participant_left"
        ? "secondary"
        : eventType.includes("abort") || eventType.includes("failed")
          ? "destructive"
          : "outline";

  return (
    <Badge variant={variant} className="shrink-0 font-mono text-[10px]">
      {eventType}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Tab: Artifacts — file links (available only)
// ---------------------------------------------------------------------------

function ArtifactsTab({ data }: { data: DashboardCall }) {
  const hasAudio = Boolean(data.audioUrl);
  const hasVideo = Boolean(data.videoUrl);
  const hasFrames = Boolean(data.framesUrl);
  const hasRecordings = hasAudio || hasVideo || hasFrames;

  const exports = [
    { label: "Transcript JSON", href: data.transcriptUrl, description: "Structured transcript with turns and timestamps" },
    { label: "Verbose JSON", href: data.verboseUrl, description: "Full session payload with metadata" },
  ].filter((a) => Boolean(a.href));

  return (
    <div className="space-y-6">
      {/* Recordings */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <IconPlayerPlay className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Recordings</h2>
          {hasRecordings && (
            <span className="ml-auto text-xs text-muted-foreground">
              {[hasAudio && "Audio", hasVideo && "Video", hasFrames && "Frames"].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        <div className="p-4">
          {!hasRecordings ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No recordings available for this call.
            </div>
          ) : (
            <div className="space-y-4">
              {hasVideo && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <IconVideo className="size-4 text-muted-foreground" />
                    Video
                  </div>
                  <video src={data.videoUrl!} controls className="w-full rounded-lg border" />
                </div>
              )}
              {hasAudio && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <IconMicrophone className="size-4 text-muted-foreground" />
                    Audio
                  </div>
                  <audio src={data.audioUrl!} controls className="w-full" />
                </div>
              )}
              {hasFrames && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <IconPhoto className="size-4 text-muted-foreground" />
                    Frames
                  </div>
                  <Link
                    href={data.framesUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    View frames
                    <IconExternalLink className="size-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Exports */}
      {exports.length > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <IconFileText className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Exports</h2>
          </div>
          <div className="divide-y">
            {exports.map((a) => (
              <div key={a.label} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
                <Link
                  href={a.href!}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Download
                  <IconExternalLink className="size-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function ParticipantStatus({
  participant,
  callStartedAt,
}: {
  participant: { identity: string; kind: string; joinedAt: string | null; leftAt: string | null; publishedAudio: boolean; publishedVideo: boolean; connectionAborted: boolean };
  callStartedAt?: Date | string | null;
}) {
  const isAgent = participant.kind === "AGENT";
  const connected = participant.joinedAt !== null;
  const tracks: string[] = [];
  if (participant.publishedAudio) tracks.push("Audio");
  if (participant.publishedVideo) tracks.push("Video");
  const joinOffset = participant.joinedAt && callStartedAt
    ? formatRelativeTime(participant.joinedAt, callStartedAt)
    : null;

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        {isAgent ? <IconRobot className="size-4 text-muted-foreground" /> : <IconUser className="size-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{participant.identity}</span>
          {isAgent && <Badge variant="secondary" className="text-[10px]">Agent</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {connected ? (
            <>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Connected
                {joinOffset && <span className="tabular-nums">+{joinOffset}</span>}
              </span>
              {tracks.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  {participant.publishedAudio && <IconMicrophone className="size-3" />}
                  {participant.publishedVideo && <IconVideo className="size-3" />}
                  {tracks.join(", ")}
                </span>
              )}
              {participant.leftAt && callStartedAt && (
                <span>Left +{formatRelativeTime(participant.leftAt, callStartedAt)}</span>
              )}
            </>
          ) : participant.connectionAborted ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <IconWifiOff className="size-3" />
              Connection aborted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              Never connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractTurns(transcript: unknown): TranscriptTurn[] {
  if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) return [];
  const turns = (transcript as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) return [];
  return turns.filter((turn): turn is TranscriptTurn => Boolean(turn && typeof turn === "object" && "text" in turn));
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(value?: number | null) {
  if (!value) return "—";
  const seconds = Math.round(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function formatRelativeTime(turnTimestamp: Date | string, sessionStart: Date | string): string {
  const diffMs = Math.max(0, new Date(turnTimestamp).getTime() - new Date(sessionStart).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
