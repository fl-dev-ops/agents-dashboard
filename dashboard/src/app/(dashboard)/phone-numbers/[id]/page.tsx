"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconLoader,
  IconPhone,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useMemo, useState } from "react";
import { useEffect } from "react";
import { Area, AreaChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsRow } from "@/components/dashboard/settings-row";
import { AgentSelect } from "@/components/dashboard/agent-select";
import { DestructiveConfirmationDialog } from "@/components/dashboard/destructive-confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTRPC } from "@/trpc/client";
import type { DashboardCall } from "@/lib/dashboard-types";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type SectionValue = "overview" | "logs" | "settings" | "info";
const SECTIONS: { value: SectionValue; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "logs", label: "Logs" },
  { value: "settings", label: "Settings" },
  { value: "info", label: "Info" },
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
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

function normalizeSection(value: string | null): SectionValue {
  return SECTIONS.some((section) => section.value === value) ? (value as SectionValue) : "overview";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PhoneNumberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PhoneNumberDetailSkeleton />}>
      <PhoneNumberDetailContent params={params} />
    </Suspense>
  );
}

function PhoneNumberDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="border-b pb-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-5 h-8 w-72" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function PhoneNumberDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = normalizeSection(searchParams.get("tab"));
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);

  const phoneNumber = useQuery({
    ...trpc.phoneNumbers.byId.queryOptions({ id }),
    refetchInterval: (query) => {
      const status = (query.state.data as Record<string, unknown>)?.connection;
      const connectionStatus = status && typeof status === "object" ? (status as Record<string, unknown>).status : null;
      return connectionStatus === "PROVISIONING" || connectionStatus === "DEPROVISIONING" ? 2000 : false;
    },
  });
  const setSection = (section: SectionValue) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", section);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.phoneNumbers.byId.queryFilter({ id })),
      queryClient.invalidateQueries(trpc.phoneNumbers.list.queryFilter()),
    ]);

  if (phoneNumber.isLoading) return <PhoneNumberDetailSkeleton />;

  if (!phoneNumber.data) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconX /></EmptyMedia>
          <EmptyTitle>Phone number not found</EmptyTitle>
          <EmptyDescription>The phone number you requested is not available.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/phone-numbers" className={buttonVariants({ variant: "outline" })}>
            Back to phone numbers
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  const phone = phoneNumber.data;
  const connection = phone.connection;
  const isActive = connection?.status === "ACTIVE";
  const isProvisioning = connection?.status === "PROVISIONING";
  const isDeprovisioning = connection?.status === "DEPROVISIONING";
  const canActivate = !isActive && !isProvisioning && !isDeprovisioning;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={phone.e164}
        description={
          <>
            {phone.label ?? "No label"}
            <span className="mx-1.5 opacity-45">·</span>
            {phone.country ?? "Unknown country"}
            {phone.region ? ` / ${phone.region}` : ""}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {canActivate ? (
              <Button size="sm" onClick={() => setActivateOpen(true)}>
                Activate
              </Button>
            ) : null}
            <Badge variant={isActive ? "default" : isProvisioning || isDeprovisioning ? "secondary" : "outline"} className="text-[11px]">
              {isActive ? <IconCheck data-icon="inline-start" /> : isProvisioning || isDeprovisioning ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconX data-icon="inline-start" />}
              {isProvisioning ? "Provisioning" : isDeprovisioning ? "Disconnecting" : connection?.status ?? "Not provisioned"}
            </Badge>
          </div>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/phone-numbers" />}>Phone numbers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{phone.e164}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="space-y-6">
        <div className="overflow-x-auto border-b" role="tablist">
          <div className="flex min-w-max gap-5">
            {SECTIONS.map((section) => (
              <button
                key={section.value}
                type="button"
                role="tab"
                aria-selected={activeSection === section.value}
                className="border-b-2 border-transparent px-0.5 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
                onClick={() => setSection(section.value)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {activeSection === "overview" && <OverviewSection phone={phone} />}
          {activeSection === "logs" && <LogsSection phone={phone} />}
          {activeSection === "settings" && <SettingsSection phone={phone} invalidate={invalidate} onActivate={() => setActivateOpen(true)} />}
          {activeSection === "info" && <InfoSection phone={phone} />}
        </div>
      </div>

      <ActivatePhoneNumberDialog
        phone={phone}
        open={activateOpen}
        onOpenChange={setActivateOpen}
        invalidate={invalidate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewSection({ phone }: { phone: Record<string, unknown> }) {
  const calls = (phone.calls ?? []) as DashboardCall[];

  const chartData = useMemo(() => {
    const now = new Date();
    const days: { date: string; label: string; total: number; success: number; failed: number; inbound: number; outbound: number }[] = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      days.push({ date: key, label, total: 0, success: 0, failed: 0, inbound: 0, outbound: 0 });
    }

    const dayMap = new Map(days.map((d) => [d.date, d]));

    for (const call of calls) {
      const created = new Date(call.createdAt);
      const key = created.toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) continue;

      bucket.total++;
      if (call.status === "COMPLETED") bucket.success++;
      if (call.status === "FAILED" || call.status === "NO_ANSWER" || call.status === "BUSY" || call.status === "DECLINED") bucket.failed++;
      if (call.fromNumber) bucket.inbound++;
      if (call.toNumber) bucket.outbound++;
    }

    return days;
  }, [calls]);

  const totalCalls = calls.length;
  const successCalls = calls.filter((c) => c.status === "COMPLETED").length;
  const failedCalls = calls.filter((c) => ["FAILED", "NO_ANSWER", "BUSY", "DECLINED"].includes(c.status)).length;
  const inboundCalls = calls.filter((c) => Boolean(c.fromNumber)).length;
  const outboundCalls = calls.filter((c) => Boolean(c.toNumber)).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total calls (14d)" value={totalCalls} color="hsl(var(--primary))" />
        <StatCard label="Successful" value={successCalls} color="#22c55e" />
        <StatCard label="Failed" value={failedCalls} color="#ef4444" />
        <StatCard label="Inbound / Outbound" value={`${inboundCalls} / ${outboundCalls}`} color="#3b82f6" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground">Calls per day</h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  labelStyle={{ fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2}>
                  <LabelList dataKey="total" position="top" fontSize={11} fill="hsl(var(--foreground))" />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Success vs Failed</h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  labelStyle={{ fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="success" name="Success" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2}>
                  <LabelList dataKey="success" position="top" fontSize={11} fill="#22c55e" />
                </Area>
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2}>
                  <LabelList dataKey="failed" position="top" fontSize={11} fill="#ef4444" />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Inbound vs Outbound</h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  labelStyle={{ fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="inbound" name="Inbound" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2}>
                  <LabelList dataKey="inbound" position="top" fontSize={11} fill="#3b82f6" />
                </Area>
                <Area type="monotone" dataKey="outbound" name="Outbound" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2}>
                  <LabelList dataKey="outbound" position="top" fontSize={11} fill="#f59e0b" />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Logs (calls table with filters)
// ---------------------------------------------------------------------------

function LogsSection({ phone }: { phone: Record<string, unknown> }) {
  const calls = (phone.calls ?? []) as DashboardCall[];
  const phoneNumber = phone.e164 as string;
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>(STATUS_OPTIONS);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return calls.filter((call) => {
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
  }, [calls, search, statuses]);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logs" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-2">
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

      {calls.length === 0 ? (
        <Empty className="rounded-none border-0 p-10">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconPhone /></EmptyMedia>
            <EmptyTitle>No logs</EmptyTitle>
            <EmptyDescription>No calls have been made with {phoneNumber} yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No logs match the current search and filters.</div>
      ) : (
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
            {filteredRows.map((call) => (
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
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsSection({ phone, invalidate, onActivate }: { phone: Record<string, unknown>; invalidate: () => Promise<unknown>; onActivate: () => void }) {
  const trpc = useTRPC();
  const [label, setLabel] = useState((phone.label as string) ?? "");
  const [labelChanged, setLabelChanged] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const currentAgentId = (phone.agent as { id: string } | null)?.id ?? "";
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId);

  const updateLabel = useMutationWithToast(
    trpc.phoneNumbers.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        setLabelChanged(false);
      },
    }),
    { success: "Label updated" },
  );

  const assignAgent = useMutationWithToast(
    trpc.phoneNumbers.assign.mutationOptions({
      onSuccess: () => {
        invalidate();
      },
    }),
    { success: "Routing update started" },
  );

  const disconnect = useMutationWithToast(
    trpc.phoneNumbers.disconnect.mutationOptions({
      onSuccess: () => {
        setDisconnectOpen(false);
        invalidate();
      },
    }),
    { success: "Disconnect started" },
  );

  const connection = phone.connection as Record<string, unknown> | null;
  const connectionStatus = connection?.status as string | undefined;
  const isActive = connection?.status === "ACTIVE";
  const isProvisioning = connectionStatus === "PROVISIONING";
  const isDeprovisioning = connectionStatus === "DEPROVISIONING";
  const isWorkflowRunning = isProvisioning || isDeprovisioning;
  const hasRoutingChange = selectedAgentId !== currentAgentId;
  const canUpdateRouting = isActive && Boolean(selectedAgentId) && hasRoutingChange && !isWorkflowRunning && !assignAgent.isPending;

  useEffect(() => {
    setSelectedAgentId(currentAgentId);
  }, [currentAgentId]);

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border bg-card px-4 py-4">
        <SettingsRow title="Label" description="Operator-facing label for this number.">
          <div className="space-y-3">
            <Input
              value={label}
              onChange={(event) => { setLabel(event.target.value); setLabelChanged(true); }}
              placeholder="e.g. Sales line"
              disabled={!isActive || isWorkflowRunning}
              className="w-64"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!isActive || isWorkflowRunning || !labelChanged || updateLabel.isPending}
                onClick={() => updateLabel.mutate({ id: phone.id as string, data: { label: label || null } })}
              >
                Save
              </Button>
            </div>
          </div>
        </SettingsRow>
      </section>

      <section className="rounded-xl border bg-card px-4 py-4">
        <SettingsRow title="Routing" description={isActive ? "Which agent handles inbound calls to this number." : "Activate this number before changing its routing."}>
          <div className="space-y-3">
            <AgentSelect
              value={selectedAgentId}
              onChange={setSelectedAgentId}
              disabled={!isActive || isWorkflowRunning}
              className="w-64"
            />
            {isActive ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!canUpdateRouting}
                  onClick={() => assignAgent.mutate({ phoneNumberId: phone.id as string, agentId: selectedAgentId })}
                >
                {assignAgent.isPending || isProvisioning ? <IconLoader className="animate-spin" data-icon="inline-start" /> : null}
                Save
                </Button>
              </div>
            ) : null}
            {(assignAgent.isPending || isProvisioning) && <span className="text-xs text-muted-foreground">Provisioning route…</span>}
            {isDeprovisioning && <span className="text-xs text-muted-foreground">Disconnecting…</span>}
          </div>
        </SettingsRow>
      </section>

      {isActive ? (
        <section className="rounded-xl border border-destructive/20 bg-card px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-destructive">Disconnect</h2>
              <p className="mt-1 text-sm text-muted-foreground">Remove SIP configuration. The number stays in Vobiz but stops routing calls.</p>
            </div>
            <Button variant="destructive" size="sm" disabled={isWorkflowRunning} onClick={() => setDisconnectOpen(true)}>
              {isDeprovisioning ? "Disconnecting" : "Disconnect"}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-primary/20 bg-card px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Activate</h2>
              <p className="mt-1 text-sm text-muted-foreground">Create SIP routing for this number and connect it to an agent.</p>
            </div>
            <Button size="sm" disabled={isWorkflowRunning || assignAgent.isPending} onClick={onActivate}>
              {isProvisioning ? <IconLoader className="animate-spin" data-icon="inline-start" /> : null}
              Activate
            </Button>
          </div>
        </section>
      )}

      <DestructiveConfirmationDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={`Disconnect ${phone.e164 as string}`}
        description="This will tear down all LiveKit and Vobiz trunks. The number stays in Vobiz but stops routing calls."
        actionLabel="Disconnect"
        pendingLabel="Disconnecting"
        isPending={disconnect.isPending || isDeprovisioning}
        onConfirm={() => disconnect.mutate({ phoneNumberId: phone.id as string })}
      />
    </div>
  );
}

function ActivatePhoneNumberDialog({
  phone,
  open,
  onOpenChange,
  invalidate,
}: {
  phone: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invalidate: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const currentAgentId = (phone.agent as { id: string } | null)?.id ?? "";
  const currentLabel = (phone.label as string | null) ?? "";
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId);
  const [label, setLabel] = useState(currentLabel);
  const connection = phone.connection as Record<string, unknown> | null;
  const connectionStatus = connection?.status as string | undefined;
  const isWorkflowRunning = connectionStatus === "PROVISIONING" || connectionStatus === "DEPROVISIONING";

  const updateLabel = useMutationWithToast(
    trpc.phoneNumbers.update.mutationOptions({}),
  );

  const assignAgent = useMutationWithToast(
    trpc.phoneNumbers.assign.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        invalidate();
      },
    }),
    { success: "Activation started" },
  );

  useEffect(() => {
    setSelectedAgentId(currentAgentId);
  }, [currentAgentId]);

  useEffect(() => {
    setLabel(currentLabel);
  }, [currentLabel]);

  const handleActivate = async () => {
    const nextLabel = label.trim();
    if (nextLabel !== currentLabel) {
      await updateLabel.mutateAsync({
        id: phone.id as string,
        data: { label: nextLabel || null },
      });
    }
    await assignAgent.mutateAsync({ phoneNumberId: phone.id as string, agentId: selectedAgentId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate {phone.e164 as string}</DialogTitle>
          <DialogDescription>
            Select the agent that should handle inbound calls to this number.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="activation-label">Label</label>
            <Input
              id="activation-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Sales line"
              disabled={isWorkflowRunning || assignAgent.isPending || updateLabel.isPending}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Agent</label>
            <AgentSelect
              value={selectedAgentId}
              onChange={setSelectedAgentId}
              disabled={isWorkflowRunning || assignAgent.isPending || updateLabel.isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedAgentId || isWorkflowRunning || assignAgent.isPending || updateLabel.isPending}
            onClick={handleActivate}
          >
            {assignAgent.isPending || updateLabel.isPending || connectionStatus === "PROVISIONING" ? <IconLoader className="animate-spin" data-icon="inline-start" /> : null}
            Activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Info (formerly Connections)
// ---------------------------------------------------------------------------

function InfoSection({ phone }: { phone: Record<string, unknown> }) {
  const connection = phone.connection as Record<string, unknown> | null;

  if (!connection) {
    return (
      <Empty className="mx-auto max-w-2xl py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconPhone /></EmptyMedia>
          <EmptyTitle>No info</EmptyTitle>
          <EmptyDescription>This phone number has not been provisioned yet. Assign it to an agent to create SIP trunks.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">Vobiz</h2>
        <div className="mt-4 space-y-3">
          <Row label="Credential ID" value={(connection.vobizCredentialId as string) ?? "—"} mono />
          <Row label="Outbound trunk" value={(connection.vobizOutboundTrunkId as string) ?? "—"} mono />
          <Row label="Inbound trunk" value={(connection.vobizInboundTrunkId as string) ?? "—"} mono />
          <Row label="Outbound domain" value={(connection.vobizOutboundDomain as string) ?? "—"} mono />
          <Row label="Inbound domain" value={(connection.vobizInboundDomain as string) ?? "—"} mono />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">LiveKit</h2>
        <div className="mt-4 space-y-3">
          <Row label="Outbound trunk" value={(connection.livekitOutboundTrunkId as string) ?? "—"} mono />
          <Row label="Inbound trunk" value={(connection.livekitInboundTrunkId as string) ?? "—"} mono />
          <Row label="Dispatch rule" value={(connection.livekitDispatchRuleId as string) ?? "—"} mono />
          <Row label="SIP endpoint" value={(connection.livekitSipEndpoint as string) ?? "—"} mono />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono text-[13px]" : ""}`}>{value}</span>
    </div>
  );
}
