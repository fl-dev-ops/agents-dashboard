"use client";

import { useQuery } from "@tanstack/react-query";
import {
  IconActivityHeartbeat,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
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
import type { DashboardAgent, DashboardCall } from "@/lib/dashboard-types";
import { useTRPC } from "@/trpc/client";
import { formatDistanceToNow } from "date-fns";

type TypeFilter = "web" | "sip";

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "web", label: "Web" },
  { value: "sip", label: "SIP" },
];

const STATUS_OPTIONS = ["QUEUED", "DIALING", "RINGING", "ACTIVE", "COMPLETED", "NO_ANSWER", "BUSY", "DECLINED", "FAILED"];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "durationMs:desc", label: "Longest first" },
  { value: "durationMs:asc", label: "Shortest first" },
];

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

function selectedStatusLabel(selected: readonly string[], total: number) {
  if (selected.length === total) return "All statuses";
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

function selectedTypeLabel(selected: readonly TypeFilter[], total: number) {
  if (selected.length === total) return "All types";
  if (selected.length === 1) return selected[0] === "web" ? "Web" : "SIP";
  return `${selected.length} selected`;
}

function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
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
          <TableHead className="text-right">Duration</TableHead>
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
            <TableCell className="text-right text-sm text-muted-foreground">
              {formatDuration(call.durationMs)}
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

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>(STATUS_OPTIONS);
  const [types, setTypes] = useState<TypeFilter[]>(["web", "sip"]);
  const [agentId, setAgentId] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "durationMs">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Debounce search
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    setDebounceTimer(timer);
  };

  // Fetch agents for filter dropdown
  const agents = useQuery(trpc.agents.list.queryOptions());
  const agentRows = (agents.data ?? []) as DashboardAgent[];

  // Build filter input
  const filterInput = useMemo(() => {
    const input: Record<string, unknown> = {
      page,
      pageSize,
      sortBy,
      sortDir,
    };
    if (debouncedSearch) input.search = debouncedSearch;
    if (phoneNumber) input.search = phoneNumber;
    if (statuses.length < STATUS_OPTIONS.length) input.status = statuses;
    if (types.length < TYPE_OPTIONS.length && types.length === 1) input.type = types[0];
    if (agentId) input.agentId = agentId;
    if (fromDate) input.from = fromDate;
    if (toDate) input.to = toDate;
    return input;
  }, [debouncedSearch, phoneNumber, statuses, types, agentId, fromDate, toDate, sortBy, sortDir, page, pageSize]);

  const calls = useQuery({
    ...trpc.calls.list.queryOptions(filterInput),
    refetchInterval: (query) => {
      const data = query.state.data as { rows: DashboardCall[] } | undefined;
      if (!data?.rows) return 30_000;
      const hasInFlight = data.rows.some((c) => c.status === "DIALING" || c.status === "RINGING" || c.status === "QUEUED");
      return hasInFlight ? 5_000 : 30_000;
    },
  });

  const data = calls.data as { rows: DashboardCall[]; total: number; page: number; totalPages: number } | undefined;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const hasActiveFilters =
    search ||
    statuses.length < STATUS_OPTIONS.length ||
    types.length < TYPE_OPTIONS.length ||
    agentId ||
    fromDate ||
    toDate;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatuses(STATUS_OPTIONS);
    setTypes(["web", "sip"]);
    setAgentId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Sessions"
        title="Sessions"
        description={phoneNumber ? <>Web and SIP sessions associated with <span className="font-mono">{phoneNumber}</span>.</> : "Web sessions and SIP calls across agents, statuses, and dates."}
      />

      <section className="rounded-xl border bg-card">
        {/* Filters row */}
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => handleSearch(event.target.value)} placeholder="Search by ID, room, agent, or number" className="pl-8" />
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-4">
            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
                Status: {selectedStatusLabel(statuses, STATUS_OPTIONS.length)}
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
                        setPage(1);
                      }}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Type filter */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
                Type: {selectedTypeLabel(types, TYPE_OPTIONS.length)}
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
                        setPage(1);
                      }}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Agent filter */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
                Agent: {agentId ? agentRows.find((a) => a.id === agentId)?.name ?? "Unknown" : "All agents"}
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Filter by agent</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={!agentId}
                    onCheckedChange={() => { setAgentId(""); setPage(1); }}
                  >
                    All agents
                  </DropdownMenuCheckboxItem>
                  {agentRows.map((agent) => (
                    <DropdownMenuCheckboxItem
                      key={agent.id}
                      checked={agentId === agent.id}
                      onCheckedChange={() => { setAgentId(agent.id); setPage(1); }}
                    >
                      {agent.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
                Sort: {SORT_OPTIONS.find((o) => o.value === `${sortBy}:${sortDir}`)?.label ?? "Newest"}
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SORT_OPTIONS.map((option) => {
                    const [field, dir] = option.value.split(":") as ["createdAt" | "durationMs", "asc" | "desc"];
                    return (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={sortBy === field && sortDir === dir}
                        onCheckedChange={() => { setSortBy(field); setSortDir(dir); setPage(1); }}
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Date range + active filter chips */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => { setFromDate(event.target.value); setPage(1); }}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => { setToDate(event.target.value); setPage(1); }}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <IconX className="mr-1 size-3" />
              Clear filters
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {total.toLocaleString()} session{total === 1 ? "" : "s"}
          </div>
        </div>

        {/* Table */}
        {calls.isLoading ? (
          <div className="p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="mb-2 h-12 w-full last:mb-0" />)}
          </div>
        ) : rows.length === 0 ? (
          <Empty className="rounded-none border-0 p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconActivityHeartbeat /></EmptyMedia>
              <EmptyTitle>No sessions found</EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters ? "No sessions match the current filters." : "Launch a web or SIP playground test to create sessions."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <SessionsTable rows={rows} />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>
          </div>
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
