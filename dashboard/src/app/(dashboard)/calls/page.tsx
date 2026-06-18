"use client";

import { useQuery } from "@tanstack/react-query";
import { IconActivityHeartbeat, IconArrowDownLeft, IconArrowUpRight, IconChevronDown, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardCall } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";
import { formatDistanceToNow } from "date-fns";

type TypeFilter = "web" | "sip";

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "web", label: "Web" },
  { value: "sip", label: "SIP" },
];

const STATUS_OPTIONS = ["QUEUED", "DIALING", "RINGING", "ACTIVE", "COMPLETED", "NO_ANSWER", "BUSY", "DECLINED", "FAILED"];

function isSipCall(call: DashboardCall) {
  return Boolean(call.toNumber || call.fromNumber || call.livekitSipParticipantId || call.livekitSipCallId);
}

function callTypeLabel(call: DashboardCall) {
  if (!isSipCall(call)) return "Web";
  if (call.toNumber) return "SIP outbound";
  if (call.fromNumber) return "SIP inbound";
  return "SIP";
}

function callTypeIcon(call: DashboardCall) {
  if (!isSipCall(call)) return null;
  return call.toNumber ? <IconArrowUpRight className="size-3.5" /> : <IconArrowDownLeft className="size-3.5" />;
}

function statusVariant(status: string) {
  if (status === "FAILED" || status === "DECLINED") return "destructive" as const;
  if (status === "COMPLETED") return "default" as const;
  if (status === "DIALING" || status === "RINGING") return "secondary" as const;
  if (status === "NO_ANSWER" || status === "BUSY") return "outline" as const;
  return "secondary" as const;
}

function selectedLabel(selected: readonly string[], total: number, allLabel: string) {
  if (selected.length === total) return allLabel;
  if (selected.length === 1) return selected[0] === "web" ? "Web" : selected[0] === "sip" ? "SIP" : selected[0];
  return `${selected.length} selected`;
}

function SessionsTable({ rows }: { rows: DashboardCall[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((call) => (
          <TableRow key={call.id}>
            <TableCell>
              <Link href={`/calls/${call.id}`} className="font-mono text-[13px] font-medium hover:underline">
                {call.roomName}
              </Link>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{call.id}</p>
            </TableCell>
            <TableCell>{call.agent?.name ?? <span className="text-muted-foreground">No agent</span>}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                  {callTypeIcon(call)}
                  {callTypeLabel(call)}
                </span>
                {isSipCall(call) ? (
                  <span className="font-mono text-xs text-muted-foreground">{call.toNumber ?? call.fromNumber ?? "SIP session"}</span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(call.status)} className="text-[11px]">{call.status}</Badge>
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CallsContent() {
  const searchParams = useSearchParams();
  const phoneNumber = searchParams.get("phoneNumber") ?? searchParams.get("toNumber");
  const trpc = useTRPC();
  const calls = useQuery({
    ...trpc.calls.list.queryOptions(phoneNumber ? { phoneNumber } : {}),
    refetchInterval: (query) => {
      const data = query.state.data as DashboardCall[] | undefined;
      if (!data) return 30_000;
      const hasInFlight = data.some((c) => c.status === "DIALING" || c.status === "RINGING" || c.status === "QUEUED");
      return hasInFlight ? 5_000 : 30_000;
    },
  });
  const rows = useMemo(() => ((calls.data ?? []) as DashboardCall[]), [calls.data]);
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<TypeFilter[]>(["web", "sip"]);
  const [statuses, setStatuses] = useState<string[]>(STATUS_OPTIONS);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((call) => {
      const type = isSipCall(call) ? "sip" : "web";
      if (!types.includes(type)) return false;
      if (!statuses.includes(call.status)) return false;
      if (!query) return true;
      return [
        call.id,
        call.roomName,
        call.agent?.name,
        call.toNumber,
        call.fromNumber,
        call.status,
        callTypeLabel(call),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [rows, search, statuses, types]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Sessions"
        title="Sessions"
        description={phoneNumber ? <>Web and SIP sessions associated with <span className="font-mono">{phoneNumber}</span>.</> : "Web sessions and SIP calls across agents, statuses, and dates."}
      />

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                Type: {selectedLabel(types, TYPE_OPTIONS.length, "All types")}
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Session type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {TYPE_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={types.includes(option.value)}
                      onCheckedChange={(checked) => {
                        setTypes((current) => checked ? [...current, option.value] : current.filter((value) => value !== option.value));
                      }}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                Status: {selectedLabel(statuses, STATUS_OPTIONS.length, "All statuses")}
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {STATUS_OPTIONS.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={statuses.includes(status)}
                      onCheckedChange={(checked) => {
                        setStatuses((current) => checked ? [...current, status] : current.filter((value) => value !== status));
                      }}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {calls.isLoading ? (
          <div className="p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="mb-2 h-12 w-full last:mb-0" />)}
          </div>
        ) : rows.length === 0 ? (
          <Empty className="rounded-none border-0 p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconActivityHeartbeat /></EmptyMedia>
              <EmptyTitle>No sessions found</EmptyTitle>
              <EmptyDescription>{phoneNumber ? `No sessions found for ${phoneNumber}.` : "Launch a web or SIP playground test to create sessions."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No sessions match the current search and filters.</div>
        ) : (
          <SessionsTable rows={filteredRows} />
        )}
      </section>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-8">
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      }
    >
      <CallsContent />
    </Suspense>
  );
}
