"use client";

import { IconDeviceFloppy, IconLoader } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTRPC } from "@/trpc/client";
import { useMutationWithToast } from "@/lib/use-mutation-with-toast";
import { type AgentForm, sanitizeAgentId } from "@/lib/dashboard-types";
import { emptyAgentForm } from "@/lib/dashboard-types";

function CreateSideField({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b px-4 py-4 last:border-b-0">
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function NewAgentPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const [form, setForm] = useState<AgentForm>(emptyAgentForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const create = useMutationWithToast(
    // @ts-ignore — tRPC type depth exceeds TS limit with Zod refine schemas
    trpc.agents.create.mutationOptions({
      onSuccess: (created) => {
        router.push(`/agents/${created.id}`);
      },
    }),
    { error: "Failed to create agent" },
  );

  const errors = {
    name: touched.name && !form.name.trim() ? "Name is required" : undefined,
    agentId: touched.agentId && !form.agentId.trim() ? "Agent ID is required" : undefined,
  };

  const submit = () => {
    setTouched({ name: true, agentId: true });
    if (!form.name.trim() || !form.agentId.trim()) return;
    create.mutate({
      ...form,
      description: form.description || undefined,
      voiceDictId: form.voiceDictId || undefined,
      knowledgeBaseCollection: form.knowledgeBaseCollection || undefined,
      egressConfigs: form.egressConfigs,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Agent profile"
        title="Create agent"
        description="Define the prompt, identity, and model for the agent."
        actions={
          <>
            <Link href="/agents" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Cancel
            </Link>
            <Button size="sm" disabled={create.isPending || !form.name || !form.agentId} onClick={submit}>
              {create.isPending ? (
                <IconLoader className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              Create agent
            </Button>
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/agents" />}>Agents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New agent</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,48rem)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">System prompt</h2>
                <p className="mt-1 text-sm text-muted-foreground">Runtime instructions sent to the voice agent.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b bg-muted/35 px-4 py-2.5">
                <span className="text-sm font-medium">Prompt editor</span>
                <span className="text-xs text-muted-foreground">Markdown</span>
              </div>
              <Textarea
                className="min-h-[430px] max-h-[600px] overflow-auto resize-none rounded-none border-0 bg-card p-6 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
                value={form.prompt}
                onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="You are a helpful, concise voice agent."
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Use variables only when the worker provides matching metadata.</p>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold">First message</h2>
              <p className="mt-1 text-sm text-muted-foreground">How the agent starts the conversation.</p>
            </div>
            <Textarea
              className="min-h-36 font-mono text-sm"
              value={form.initialReply}
              onChange={(event) => setForm((current) => ({ ...current, initialReply: event.target.value }))}
              placeholder="Greet the caller and ask what they want to practice today."
            />
          </section>
        </div>

        <aside className="h-fit rounded-xl border bg-card lg:mt-16">
          <CreateSideField title="Name" description="Visible name for operators.">
            <div className="w-full space-y-1.5">
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                placeholder="Agent name"
                aria-invalid={!!errors.name}
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
          </CreateSideField>

          <CreateSideField title="Agent ID" description="Stable ID passed in dispatch metadata.">
            <div className="w-full space-y-1.5">
              <Input
                onChange={(event) => setForm((current) => ({ ...current, agentId: sanitizeAgentId(event.target.value) }))}
                onBlur={() => setTouched((current) => ({ ...current, agentId: true }))}
                placeholder="agent-id"
                className="font-mono"
                aria-invalid={!!errors.agentId}
              />
              {errors.agentId ? <p className="text-xs text-destructive">{errors.agentId}</p> : null}
            </div>
          </CreateSideField>

          <CreateSideField title="Model" description="Language model used for calls.">
            <ModelSelector value={form.model} onChange={(v) => setForm((current) => ({ ...current, model: v }))} />
          </CreateSideField>
        </aside>
      </div>
    </div>
  );
}
