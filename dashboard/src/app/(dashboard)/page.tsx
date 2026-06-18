"use client";

import { useQuery } from "@tanstack/react-query";
import { IconActivityHeartbeat } from "@tabler/icons-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardCall } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";
import { formatDistanceToNow } from "date-fns";

type SessionFilter = "all" | "web" | "sip";

type DayPoint = {
  date: string;
  label: string;
  web: number;
  sip: number;
  completed: number;
  dialing: number;
  ringing: number;
  failed: number;
  unsuccessful: number;
  queued: number;
  active: number;
};

type PhoneUsage = {
  number: string;
  label: string | null;
  inbound: number;
  outbound: number;
};

const sessionConfig = {
  web: { label: "Web", color: "var(--chart-1)" },
  sip: { label: "SIP", color: "var(--chart-2)" },
} satisfies ChartConfig;

const statusConfig = {
  completed: { label: "Completed", color: "var(--chart-1)" },
  dialing: { label: "Dialing", color: "var(--chart-4)" },
  ringing: { label: "Ringing", color: "var(--chart-2)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  unsuccessful: { label: "Unsuccessful", color: "var(--muted-foreground)" },
  queued: { label: "Queued", color: "var(--chart-5)" },
  active: { label: "Active", color: "var(--chart-3)" },
} satisfies ChartConfig;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(new Date(`${key}T00:00:00`));
}

function getLast30Days() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const key = dayKey(date);
    return {
      date: key,
      label: dayLabel(key),
      web: 0,
      sip: 0,
      completed: 0,
      dialing: 0,
      ringing: 0,
      failed: 0,
      unsuccessful: 0,
      queued: 0,
      active: 0,
    } satisfies DayPoint;
  });
}

function isSipCall(call: DashboardCall) {
  return Boolean(call.toNumber || call.fromNumber || call.livekitSipParticipantId || call.livekitSipCallId);
}

function statusVariant(status: string) {
  if (status === "FAILED" || status === "DECLINED") return "destructive" as const;
  if (status === "COMPLETED") return "default" as const;
  if (status === "NO_ANSWER" || status === "BUSY") return "outline" as const;
  return "secondary" as const;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="border-b pb-6">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const trpc = useTRPC();
  const calls = useQuery(trpc.calls.list.queryOptions({ days: 30 }));
  const callRows = useMemo(() => ((calls.data ?? []) as DashboardCall[]), [calls.data]);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");

  const { dayPoints, topNumbers } = useMemo(() => buildInsights(callRows), [callRows]);
  const visibleCalls = useMemo(() => callRows.filter((call) => {
    if (sessionFilter === "all") return true;
    const sip = isSipCall(call);
    return sessionFilter === "sip" ? sip : !sip;
  }), [callRows, sessionFilter]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Last 30 days"
        title="Dashboard"
        description="Call volume and reliability across web sessions and SIP calls."
      />

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Sessions over time</h2>
            <p className="mt-1 text-sm text-muted-foreground">Web and SIP sessions started each day.</p>
          </div>
          <div className="flex rounded-md border bg-background p-1">
            {(["all", "web", "sip"] as const).map((value) => (
              <Button
                key={value}
                variant={sessionFilter === value ? "secondary" : "ghost"}
                size="sm"
                className="h-7 capitalize"
                onClick={() => setSessionFilter(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {calls.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : callRows.length ? (
            <ChartContainer config={sessionConfig} className="h-72 w-full aspect-auto">
              <LineChart accessibilityLayer data={dayPoints} margin={{ left: 8, right: 16, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={22} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {(sessionFilter === "all" || sessionFilter === "web") ? <Line dataKey="web" type="monotone" stroke="var(--color-web)" strokeWidth={2} dot={false} /> : null}
                {(sessionFilter === "all" || sessionFilter === "sip") ? <Line dataKey="sip" type="monotone" stroke="var(--color-sip)" strokeWidth={2} dot={false} /> : null}
              </LineChart>
            </ChartContainer>
          ) : (
            <Empty className="rounded-none border-0 p-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><IconActivityHeartbeat /></EmptyMedia>
                <EmptyTitle>No calls in the last 30 days</EmptyTitle>
                <EmptyDescription>Run web or SIP tests to populate dashboard insights.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">Top phone numbers by calls</h2>
            <p className="mt-1 text-sm text-muted-foreground">Inbound and outbound SIP activity by imported number.</p>
          </div>
          <div className="divide-y">
            {calls.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="mx-4 my-3 h-10" />)
            ) : topNumbers.length ? (
              topNumbers.slice(0, 8).map((number) => (
                <div key={number.number} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-medium">{number.number}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{number.label ?? "No label"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="text-muted-foreground">In <span className="font-medium text-foreground tabular-nums">{number.inbound}</span></span>
                    <span className="text-muted-foreground">Out <span className="font-medium text-foreground tabular-nums">{number.outbound}</span></span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">No SIP calls in the last 30 days.</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">Call status by date</h2>
            <p className="mt-1 text-sm text-muted-foreground">Daily status counts for reliability review.</p>
          </div>
          <div className="p-4">
            {calls.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : callRows.length ? (
              <ChartContainer config={statusConfig} className="h-64 w-full aspect-auto">
                <LineChart accessibilityLayer data={dayPoints} margin={{ left: 8, right: 16, top: 12, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={22} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="completed" type="monotone" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
                  <Line dataKey="dialing" type="monotone" stroke="var(--color-dialing)" strokeWidth={2} dot={false} />
                  <Line dataKey="ringing" type="monotone" stroke="var(--color-ringing)" strokeWidth={2} dot={false} />
                  <Line dataKey="failed" type="monotone" stroke="var(--color-failed)" strokeWidth={2} dot={false} />
                  <Line dataKey="unsuccessful" type="monotone" stroke="var(--color-unsuccessful)" strokeWidth={2} dot={false} />
                  <Line dataKey="queued" type="monotone" stroke="var(--color-queued)" strokeWidth={2} dot={false} />
                  <Line dataKey="active" type="monotone" stroke="var(--color-active)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No status data yet.</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Calls</h2>
          <p className="mt-1 text-sm text-muted-foreground">Filtered by the selected session type, last 30 days.</p>
        </div>
        {calls.isLoading ? (
          <div className="p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-2 h-10 w-full last:mb-0" />)}</div>
        ) : visibleCalls.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCalls.slice(0, 10).map((call) => (
                <TableRow key={call.id}>
                  <TableCell>
                    <Link href={`/calls/${call.id}`} className="font-mono text-[13px] font-medium hover:underline">{call.roomName}</Link>
                  </TableCell>
                  <TableCell>{isSipCall(call) ? "SIP" : "Web"}</TableCell>
                  <TableCell>{call.agent?.name ?? "No agent"}</TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{call.toNumber ?? call.fromNumber ?? "Web session"}</TableCell>
                  <TableCell><Badge variant={statusVariant(call.status)} className="text-[11px]">{call.status}</Badge></TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No calls match this session filter.</div>
        )}
      </section>
    </div>
  );
}

function buildInsights(calls: DashboardCall[]) {
  const dayPoints = getLast30Days();
  const byDate = new Map(dayPoints.map((point) => [point.date, point]));
  const phoneMap = new Map<string, PhoneUsage>();

  for (const call of calls) {
    const point = byDate.get(dayKey(new Date(call.createdAt)));
    if (point) {
      if (isSipCall(call)) point.sip += 1;
      else point.web += 1;

      const statusKey = call.status.toLowerCase();
      if (statusKey === "completed") point.completed += 1;
      else if (statusKey === "dialing") point.dialing += 1;
      else if (statusKey === "ringing") point.ringing += 1;
      else if (statusKey === "failed") point.failed += 1;
      else if (statusKey === "active") point.active += 1;
      else if (statusKey === "no_answer" || statusKey === "busy" || statusKey === "declined") point.unsuccessful += 1;
      else point.queued += 1;
    }

    const phoneNumber = call.phoneNumber?.e164 ?? call.fromNumber ?? call.toNumber;
    if (!phoneNumber) continue;
    const usage = phoneMap.get(phoneNumber) ?? { number: phoneNumber, label: call.phoneNumber?.label ?? null, inbound: 0, outbound: 0 };
    if (!usage.label && call.phoneNumber?.label) usage.label = call.phoneNumber.label;
    if (call.fromNumber === phoneNumber) usage.outbound += 1;
    else usage.inbound += 1;
    phoneMap.set(phoneNumber, usage);
  }

  const topNumbers = [...phoneMap.values()].sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound));
  return { dayPoints, topNumbers };
}
