"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDotsVertical,
  IconPencil,
  IconPlus,
  IconRobot,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { DestructiveConfirmationDialog } from "@/components/dashboard/destructive-confirmation-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import type { DashboardAgent } from "@/lib/dashboard-types";
import { formatDistanceToNow } from "date-fns";

export default function AgentsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const agents = useQuery(trpc.agents.list.queryOptions());
  const rows = useMemo(() => ((agents.data ?? []) as DashboardAgent[]), [agents.data]);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DashboardAgent | null>(null);

  const deleteAgent = useMutationWithToast(
    trpc.agents.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.agents.list.queryFilter());
        setDeleteTarget(null);
      },
    }),
    { success: "Agent deleted" },
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.agentId.toLowerCase().includes(query) ||
        agent.model.toLowerCase().includes(query) ||
        agent.voiceSpeaker.toLowerCase().includes(query),
    );
  }, [rows, search]);
  const maxUsage = Math.max(1, ...filtered.map((agent) => agent.usageCount7d ?? 0));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        label="Agent registry"
        title="Agents"
        description="Profiles the LiveKit worker resolves at dispatch time. Keep prompts, voices, and IDs easy to inspect."
        actions={
          <Link href="/agents/new" className={buttonVariants({ size: "sm" })}>
            <IconPlus data-icon="inline-start" />
            Create agent
          </Link>
        }
      />

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {rows.length} agents
          </span>
        </div>

        {agents.isLoading ? (
          <div className="p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="mb-2 h-12 w-full last:mb-0" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="rounded-none border-0 p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconRobot />
              </EmptyMedia>
              <EmptyTitle>{search.trim() ? "No agents match this search" : "Create the first agent"}</EmptyTitle>
              <EmptyDescription>
                {search.trim()
                  ? "Try a name, Agent ID, model, or voice."
                  : "Agents store the prompt, identity, model, voice, and tools used during calls."}
              </EmptyDescription>
            </EmptyHeader>
            {!search.trim() ? (
              <EmptyContent>
                <Link href="/agents/new" className={buttonVariants()}>
                  <IconPlus data-icon="inline-start" />
                  Create agent
                </Link>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Agent ID</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((agent) => (
                <TableRow
                  key={agent.id}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => router.push(`/agents/${agent.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/agents/${agent.id}`);
                  }}
                >
                  <TableCell>
                    <div className="flex min-w-52 items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.model}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-48">
                      <p className="font-mono text-[13px] text-foreground">{agent.agentId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Agent ID</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-36">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Last 7 days</span>
                        <span className="text-xs font-medium tabular-nums">{agent.usageCount7d ?? 0} calls</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, ((agent.usageCount7d ?? 0) / maxUsage) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(agent.updatedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.isActive ? "default" : "secondary"} className="text-[11px]">
                      {agent.isActive ? "Ready" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${agent.name}`} />}>
                        <IconDotsVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/agents/${agent.id}`} />}>
                          <IconPencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(event) => {
                            event.preventDefault();
                            setDeleteTarget(agent);
                          }}
                        >
                          <IconTrash />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <DestructiveConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete agent"
        description={
          <>
            Delete &ldquo;{deleteTarget?.name}&rdquo; permanently. Call history remains, but this agent profile cannot be restored.
          </>
        }
        actionLabel="Delete agent"
        pendingLabel="Deleting"
        isPending={deleteAgent.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteAgent.mutate({ id: deleteTarget.id });
        }}
      />
    </div>
  );
}
