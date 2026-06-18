"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconCheck, IconPlayerPlay, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { use, useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Cfg = {
  id: string; name: string; description: string | null; prompt: string;
  schema: Record<string, unknown>; model: string; createdAt: Date; updatedAt: Date;
};

type RunResult = {
  result: Record<string, unknown> | null;
  error: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  durationMs: number;
};

function stripModelPrefix(id: string): string {
  const i = id.indexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}

function addModelPrefix(bare: string): string {
  if (bare.includes("/")) return bare;
  return `openai/${bare}`;
}

export default function EvaluationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const config = useQuery(trpc.evaluations.getConfig.queryOptions({ id }));
  const calls = useQuery(trpc.calls.list.queryOptions());

  const [activeTab, setActiveTab] = useState<"config" | "run">("config");
  const [selectedCallId, setSelectedCallId] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const allCalls = (calls.data ?? []) as Array<{ id: string; roomName: string; status: string; transcript: unknown; agent: { name: string } | null }>;
  const completedCalls = allCalls.filter((c) => c.status === "COMPLETED" && c.transcript);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schemaText, setSchemaText] = useState("");
  const [model, setModel] = useState("openai/gpt-4.1-mini");
  const [initialized, setInitialized] = useState(false);

  const cfg = config.data as unknown as Cfg | undefined;

  if (cfg && !initialized) {
    setName(cfg.name ?? "");
    setDescription(cfg.description ?? "");
    setPrompt(cfg.prompt ?? "");
    setSchemaText(JSON.stringify(cfg.schema, null, 2));
    setModel(addModelPrefix(cfg.model ?? "gpt-4.1-mini"));
    setInitialized(true);
  }

  const updateConfig = useMutationWithToast(
    (trpc.evaluations.updateConfig as { mutationOptions: (opts: unknown) => unknown }).mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.evaluations.getConfig.queryKey({ id }) });
      },
    }),
    { success: "Config updated." },
  );

  const runEvaluation = useMutationWithToast(
    (trpc.evaluations.run as { mutationOptions: (opts: unknown) => unknown }).mutationOptions({
      onSuccess: (data: unknown) => {
        const d = data as { result: unknown; error: string | null; usage: unknown; durationMs: number };
        setRunResult({
          result: d.result as Record<string, unknown> | null,
          error: d.error,
          usage: d.usage as RunResult["usage"],
          durationMs: d.durationMs,
        });
      },
    }),
  );

  const handleSave = () => {
    let schema: Record<string, unknown>;
    try { schema = JSON.parse(schemaText); } catch { return toast.error("Schema is not valid JSON."); }
    updateConfig.mutate({
      id,
      data: {
        name: name.trim(), description: description.trim() || undefined,
        prompt: prompt.trim(), schema,
        model: stripModelPrefix(model),
      },
    });
  };

  const handleRun = () => {
    if (!selectedCallId) return toast.error("Select a call to evaluate.");
    setRunResult(null);
    runEvaluation.mutate({ configId: id, callId: selectedCallId });
  };

  if (config.isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!cfg) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconX /></EmptyMedia>
          <EmptyTitle>Config not found</EmptyTitle>
          <EmptyDescription>This evaluation config no longer exists.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/evaluations" className={buttonVariants({ variant: "outline" })}>Back to evaluations</Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Evaluations"
        title={cfg.name}
        description={cfg.description ?? "Evaluation config detail."}
        actions={
          <Link href="/evaluations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <IconArrowLeft data-icon="inline-start" />
            Back
          </Link>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/evaluations" />}>Evaluations</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-48 truncate">{cfg.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="overflow-x-auto border-b" role="tablist">
          <div className="flex min-w-max gap-5">
            {(["config", "run"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className="border-b-2 border-transparent px-0.5 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "config" ? "Config" : "Run"}
              </button>
            ))}
          </div>
        </div>

        {/* Config tab */}
        {activeTab === "config" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Left: prompt + schema */}
            <div className="space-y-6">
              <section className="rounded-xl border bg-card">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold">Prompt</h2>
                </div>
                <div className="p-4">
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={14} className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed" />
                </div>
              </section>

              <section className="rounded-xl border bg-card">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold">Output Schema</h2>
                </div>
                <div className="p-4">
                  <textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} rows={16} spellCheck={false} className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed" />
                </div>
              </section>
            </div>

            {/* Right: name, model, description, save */}
            <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <ModelSelector value={model} onChange={setModel} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {formatDistanceToNow(new Date(cfg.createdAt), { addSuffix: true })}
                </div>
              </div>
              <Button onClick={handleSave} disabled={updateConfig.isPending} className="w-full">
                {updateConfig.isPending ? "Saving..." : "Save changes"}
              </Button>
            </aside>
          </div>
        )}

        {/* Run tab */}
        {activeTab === "run" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <section className="rounded-xl border bg-card">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold">Select Call</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a completed call with a transcript.</p>
                </div>
                <div className="p-4">
                  <select value={selectedCallId} onChange={(e) => setSelectedCallId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">Select a call...</option>
                    {completedCalls.map((call) => (
                      <option key={call.id} value={call.id}>{call.roomName} — {call.agent?.name ?? "Unknown"}</option>
                    ))}
                  </select>
                </div>
              </section>

              {runResult && (
                <section className="rounded-xl border bg-card">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-base font-semibold">Result</h2>
                    {runResult.usage && (
                      <span className="text-xs text-muted-foreground">
                        {runResult.usage.total_tokens} tokens · {(runResult.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    {runResult.error ? (
                      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                        <IconX className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Failed</p>
                          <p className="mt-1 text-sm text-muted-foreground">{runResult.error}</p>
                        </div>
                      </div>
                    ) : runResult.result ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <IconCheck className="size-4 text-emerald-500" />
                          <span className="text-sm font-medium">Complete</span>
                        </div>
                        <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm leading-relaxed">
                          {JSON.stringify(runResult.result, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </section>
              )}
            </div>

            <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
              <div>
                <h2 className="text-base font-semibold">Run evaluation</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sends the transcript to <span className="font-mono text-xs">{cfg.model}</span> with the configured prompt and schema.
                </p>
              </div>
              <Button onClick={handleRun} disabled={runEvaluation.isPending || !selectedCallId} className="w-full" size="lg">
                {runEvaluation.isPending ? "Running..." : <><IconPlayerPlay className="size-4" /> Run</>}
              </Button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
