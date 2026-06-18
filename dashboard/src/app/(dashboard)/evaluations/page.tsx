"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChartBar,
  IconDotsVertical,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { DestructiveConfirmationDialog } from "@/components/dashboard/destructive-confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import { formatDistanceToNow } from "date-fns";


type EvalConfig = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
};
export default function EvaluationsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const configs = useQuery(trpc.evaluations.listConfigs.queryOptions());
  const rows = (configs.data ?? []) as EvalConfig[];
  const [deleteTarget, setDeleteTarget] = useState<EvalConfig | null>(null);

  const deleteConfig = useMutationWithToast(
    trpc.evaluations.deleteConfig.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.evaluations.listConfigs.queryKey() });
        setDeleteTarget(null);
      },
    }),
    { success: "Evaluation deleted" },
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        label="Playground"
        title="Evaluations"
        description="Manage evaluation configs. Run structured analysis against call transcripts."
        actions={
          <Link href="/evaluations/new" className={buttonVariants({ size: "sm" })}>
            <IconPlus data-icon="inline-start" />
            New config
          </Link>
        }
      />

      {configs.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconChartBar />
            </EmptyMedia>
            <EmptyTitle>No evaluation configs</EmptyTitle>
            <EmptyDescription>
              Create an evaluation config to start analyzing call transcripts with structured LLM output.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/evaluations/new" className={buttonVariants()}>
              <IconPlus data-icon="inline-start" />
              Create config
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((config) => (
                <TableRow
                  key={config.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/evaluations/${config.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">{config.name}</p>
                      {config.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{config.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px]">{config.model}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(config.updatedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                        <IconDotsVertical className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => router.push(`/evaluations/${config.id}`)}
                        >
                          <IconPencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteTarget(config)}
                        >
                          <IconTrash className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DestructiveConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete evaluation config?"
        description={
          <>
            This will permanently delete &quot;{deleteTarget?.name}&quot; and all its evaluation runs. This cannot be undone.
          </>
        }
        actionLabel="Delete"
        pendingLabel="Deleting"
        isPending={deleteConfig.isPending}
        onConfirm={() => deleteTarget && deleteConfig.mutate({ id: deleteTarget.id })}
      />
    </div>
  );
}
