"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowRight, IconCheck, IconDownload, IconLoader, IconPhone, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardPhoneNumber } from "@/lib/dashboard-types";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import { useTRPC } from "@/trpc/client";

type VobizImportNumber = {
  id: string;
  e164: string;
  country?: string;
  region?: string;
  status?: string;
  imported: boolean;
  importedId: string | null;
  importedLabel: string | null;
};

export default function PhoneNumbersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const phoneNumbers = useQuery(trpc.phoneNumbers.list.queryOptions());
  const rows = (phoneNumbers.data ?? []) as DashboardPhoneNumber[];
  const usableNumbers = rows.filter((number) => number.status === "ACTIVE");
  const [importOpen, setImportOpen] = useState(false);

  const invalidateNumbers = () => Promise.all([
    queryClient.invalidateQueries(trpc.phoneNumbers.list.queryFilter()),
    queryClient.invalidateQueries(trpc.phoneNumbers.availableFromVobiz.queryFilter()),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Telephony"
        title="Phone numbers"
        description={`${rows.length} imported number${rows.length === 1 ? "" : "s"}, ${usableNumbers.length} ready for routing.`}
        actions={
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <IconDownload data-icon="inline-start" />
              Import numbers
            </DialogTrigger>
            <DialogContent className="sm:max-w-[960px]">
              <DialogHeader>
                <DialogTitle>Import Vobiz numbers</DialogTitle>
                <DialogDescription>Select the Vobiz numbers Intervoo should manage locally. Add labels during import so operators can recognize them later.</DialogDescription>
              </DialogHeader>
              <ImportNumbersDialog onImported={invalidateNumbers} />
            </DialogContent>
          </Dialog>
        }
      />

      {phoneNumbers.isLoading ? (
        <section className="rounded-xl border bg-card p-4">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="mb-2 h-12 w-full last:mb-0" />)}
        </section>
      ) : rows.length === 0 ? (
        <Empty className="mx-auto max-w-2xl py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconPhone /></EmptyMedia>
            <EmptyTitle>Import phone inventory</EmptyTitle>
            <EmptyDescription>Import Vobiz numbers before assigning inbound routes or launching SIP tests.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setImportOpen(true)}>
              <IconDownload data-icon="inline-start" />
              Import numbers
            </Button>
            <div className="grid w-full gap-2 text-left text-sm text-muted-foreground sm:grid-cols-3">
              <span>1. Review Vobiz DIDs</span>
              <span>2. Label imported numbers</span>
              <span>3. Assign to agents</span>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <section className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned agent</TableHead>
                <TableHead>Trunks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((number) => (
                <TableRow key={number.id}>
                  <TableCell>
                    <Link href={`/phone-numbers/${number.id}`} className="font-mono text-[13px] font-medium hover:underline">{number.e164}</Link>
                  </TableCell>
                  <TableCell>{number.label ?? <span className="text-muted-foreground">No label</span>}</TableCell>
                  <TableCell>
                    <Badge variant={number.status === "ACTIVE" ? "default" : "secondary"} className="text-[11px]">
                      {number.status === "ACTIVE" ? <IconCheck data-icon="inline-start" /> : <IconX data-icon="inline-start" />}
                      {number.status === "ACTIVE" ? "Ready" : number.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{number.agent ? number.agent.name : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">
                      {number.connection?.livekitInboundTrunkId || number.connection?.livekitOutboundTrunkId ? (
                        <>
                          {number.connection.livekitInboundTrunkId ? "Inbound" : ""}
                          {number.connection.livekitInboundTrunkId && number.connection.livekitOutboundTrunkId ? " / " : ""}
                          {number.connection.livekitOutboundTrunkId ? "Outbound" : ""}
                        </>
                      ) : "No trunk"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/phone-numbers/${number.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        <IconArrowRight data-icon="inline-start" />
                        Manage
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

function ImportNumbersDialog({ onImported }: { onImported: () => Promise<unknown> }) {
  const trpc = useTRPC();
  const available = useQuery(trpc.phoneNumbers.availableFromVobiz.queryOptions());
  const numbers = (available.data?.items ?? []) as VobizImportNumber[];
  const [labels, setLabels] = useState<Record<string, string>>({});

  const importNumber = useMutationWithToast(
    trpc.phoneNumbers.importFromVobiz.mutationOptions({
      onSuccess: async () => {
        await onImported();
      },
    }),
    { success: "Phone number imported" },
  );

  if (available.isLoading) {
    return <div className="space-y-2 py-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;
  }

  if (available.isError) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{available.error.message}</div>;
  }

  if (!numbers.length) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No Vobiz numbers were returned.</div>;
  }

  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vobiz number</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Import</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {numbers.map((number) => {
            const label = labels[number.id] ?? number.importedLabel ?? "";
            return (
              <TableRow key={number.id}>
                <TableCell className="font-mono text-[13px] font-medium">{number.e164}</TableCell>
                <TableCell>
                  <Badge variant={number.status?.toLowerCase() === "active" ? "default" : "secondary"} className="text-[11px]">
                    {number.status ?? "Unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{[number.country, number.region].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell>
                  <Input
                    value={label}
                    placeholder="Operator label"
                    disabled={number.imported}
                    onChange={(event) => setLabels((current) => ({ ...current, [number.id]: event.target.value }))}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {number.imported ? (
                    <Badge variant="secondary" className="text-[11px]">Imported</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importNumber.isPending}
                      onClick={() => importNumber.mutate({ vobizNumberId: number.id, label })}
                    >
                      {importNumber.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDownload data-icon="inline-start" />}
                      Import
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
