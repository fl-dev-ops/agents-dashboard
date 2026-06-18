"use client";

import { useMutation } from "@tanstack/react-query";
import { IconArrowLeft, IconDeviceFloppy } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTRPC } from "@/trpc/client";
import { toast } from "sonner";

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

/**
 * Strip the provider prefix (e.g. "openai/") from model IDs that the
 * ModelSelector returns, since the evaluation API expects bare model names.
 */
function stripModelPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

export default function NewEvaluationPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA);
  const [model, setModel] = useState("openai/gpt-4.1-mini");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const create = useMutation(
    (trpc.evaluations.createConfig as { mutationOptions: (opts: unknown) => unknown }).mutationOptions({
      onSuccess: (data: unknown) => {
        const d = data as { id: string };
        toast.success("Evaluation config created.");
        router.push(`/evaluations/${d.id}`);
      },
      onError: (err: Error) => toast.error(err.message),
    }) as Parameters<typeof useMutation>[0],
  );

  const errors = {
    name: touched.name && !name.trim() ? "Name is required" : null,
    prompt: touched.prompt && !prompt.trim() ? "Prompt is required" : null,
    schema: touched.schemaText
      ? (() => { try { JSON.parse(schemaText); return null; } catch { return "Invalid JSON"; } })()
      : null,
  };

  const hasErrors = Object.values(errors).some(Boolean);
  const isValid = name.trim() && prompt.trim() && !hasErrors;

  const handleSubmit = () => {
    setTouched({ name: true, prompt: true, schemaText: true });
    if (!isValid) return;

    let schema: Record<string, unknown>;
    try { schema = JSON.parse(schemaText); } catch { return; }

    create.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      prompt: prompt.trim(),
      schema,
      model: stripModelPrefix(model),
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Evaluations"
        title="New evaluation config"
        description="Define a prompt and output schema for structured call analysis."
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
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left: prompt + schema */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Prompt</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The system message sent to the LLM along with the call transcript.
              </p>
            </div>
            <div className="p-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, prompt: true }))}
                placeholder="You are evaluating a call transcript. Assess the quality of the agent's screening..."
                rows={14}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
              />
              {errors.prompt && <p className="mt-1 text-xs text-destructive">{errors.prompt}</p>}
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Output Schema</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                JSON Schema for the structured output. Must have <code>type: &quot;object&quot;</code>.
              </p>
            </div>
            <div className="p-4">
              <textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, schemaText: true }))}
                rows={16}
                spellCheck={false}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
              />
              {errors.schema && <p className="mt-1 text-xs text-destructive">{errors.schema}</p>}
            </div>
          </section>
        </div>

        {/* Right: name + model + save */}
        <aside className="h-fit space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Screening quality rubric"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Evaluates agent screening quality"
              />
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <ModelSelector value={model} onChange={setModel} />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={create.isPending || !isValid}
            className="mt-2 w-full"
          >
            {create.isPending ? "Creating..." : <><IconDeviceFloppy className="size-4" /> Create config</>}
          </Button>
        </aside>
      </div>
    </div>
  );
}
