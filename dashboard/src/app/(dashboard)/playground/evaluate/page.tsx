"use client";

import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft, IconPlayerPlay, IconSettings, IconCheck, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";

const DEFAULT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      summary: { type: "string" },
      score: { type: "number" },
    },
    required: ["summary", "score"],
    additionalProperties: false,
  },
  null,
  2,
);

export default function EvaluatePage() {
  const trpc = useTRPC();

  // Config
  const [prompt, setPrompt] = useState("");
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA);
  const [model, setModel] = useState("gpt-4o-mini");
  const [selectedCallId, setSelectedCallId] = useState("");

  // Result
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [resultUsage, setResultUsage] = useState<{ prompt_tokens: number; completion_tokens: number; total_tokens: number } | null>(null);
  const [resultDurationMs, setResultDurationMs] = useState<number | null>(null);

  const calls = useQuery(trpc.calls.list.queryOptions());
  const models = useQuery(trpc.evaluations.models.queryOptions());
  const allCalls = (calls.data ?? []) as Array<{ id: string; roomName: string; status: string; transcript: unknown; agent: { name: string } | null }>;
  const completedCalls = allCalls.filter((c) => c.status === "COMPLETED" && c.transcript);

  const runAdHoc = useMutationWithToast(
    trpc.evaluations.runAdHoc.mutationOptions({
      onSuccess: (data) => {
        setResult(data.result);
        setResultError(data.error);
        setResultUsage(data.usage);
        setResultDurationMs(data.durationMs);
      },
    }),
  );

  const handleRun = () => {
    if (!selectedCallId) return toast.error("Select a call to evaluate.");
    if (!prompt.trim()) return toast.error("Write an evaluation prompt.");

    let schema: Record<string, unknown>;
    try { schema = JSON.parse(schemaText); } catch { return toast.error("Schema is not valid JSON."); }

    setResult(null);
    setResultError(null);
    setResultUsage(null);
    setResultDurationMs(null);
    runAdHoc.mutate({ prompt, schema, model: model as "gpt-4o-mini" | "gpt-4o" | "gpt-4.1-mini" | "gpt-4.1-nano" | "gpt-4.1", callId: selectedCallId });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Test bench"
        title="Evaluate"
        description="Test your evaluation prompt and schema against a call transcript."
        actions={
          <Link href="/playground" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <IconArrowLeft data-icon="inline-start" />
            Playground
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: config */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <IconSettings className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Configuration</h2>
            </div>
            <div className="space-y-5 p-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {(models.data ?? ["gpt-4o-mini", "gpt-4o"]).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Evaluation Prompt</Label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="You are evaluating a call transcript. Assess the quality of the agent's screening..."
                  rows={8}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <Label>Output Schema (JSON)</Label>
                <textarea
                  value={schemaText}
                  onChange={(e) => setSchemaText(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">
                  Must be a valid JSON Schema with <code>type: &quot;object&quot;</code>. Strict mode is applied automatically.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right: call selector + result */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Select Call</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose a completed call with a transcript.</p>
            </div>
            <div className="p-4">
              {calls.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <select
                  value={selectedCallId}
                  onChange={(e) => setSelectedCallId(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a call...</option>
                  {completedCalls.map((call) => (
                    <option key={call.id} value={call.id}>
                      {call.roomName} — {call.agent?.name ?? "Unknown"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </section>

          <Button
            onClick={handleRun}
            disabled={runAdHoc.isPending || !selectedCallId || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {runAdHoc.isPending ? (
              "Running evaluation..."
            ) : (
              <>
                <IconPlayerPlay className="size-4" />
                Run Evaluation
              </>
            )}
          </Button>

          {(result || resultError || runAdHoc.isPending) && (
            <section className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-base font-semibold">Result</h2>
                {resultUsage && resultDurationMs && (
                  <span className="text-xs text-muted-foreground">
                    {resultUsage.total_tokens} tokens · {(resultDurationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="p-4">
                {runAdHoc.isPending ? (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Evaluating transcript...
                  </div>
                ) : resultError ? (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <IconX className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Evaluation failed</p>
                      <p className="mt-1 text-sm text-muted-foreground">{resultError}</p>
                    </div>
                  </div>
                ) : result ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <IconCheck className="size-4 text-emerald-500" />
                      <span className="text-sm font-medium">Evaluation complete</span>
                    </div>
                    <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
