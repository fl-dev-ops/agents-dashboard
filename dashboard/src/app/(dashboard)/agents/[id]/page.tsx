"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconLoader,
  IconMicrophone,
  IconPhoto,
  IconPhone,
  IconPhoneOff,
  IconPlus,
  IconTrash,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { VoiceSelector } from "@/components/dashboard/voice-selector";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsRow } from "@/components/dashboard/settings-row";
import { Item, ItemMedia, ItemContent, ItemActions, ItemTitle, ItemDescription } from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countTokens } from "@/lib/tokenizer";
import { sanitizeAgentId, EGRESS_TYPES, MAX_EGRESS_COUNT, FRAME_INTERVAL_PRESETS } from "@/lib/dashboard-types";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTRPC } from "@/trpc/client";
import type { DashboardPhoneNumber } from "@/lib/dashboard-types";

const SECTIONS = ["prompt", "voice", "recording", "tools", "phone-numbers", "settings"] as const;
type SectionValue = (typeof SECTIONS)[number];

type PromptForm = {
  name: string;
  agentId: string;
  prompt: string;
  initialReply: string;
  model: string;
  voiceSpeaker: string;
  voiceDictId: string;
};

function normalizeSection(value: string | null): SectionValue {
  if (value === "personality") return "prompt";
  return SECTIONS.includes(value as SectionValue) ? (value as SectionValue) : "prompt";
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AgentDetailSkeleton />}>
      <AgentDetailContent params={params} />
    </Suspense>
  );
}

function AgentDetailSkeleton() {
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

function AgentDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = normalizeSection(searchParams.get("tab"));

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const agent = useQuery(trpc.agents.byId.queryOptions({ id }));
  const phoneNumbers = useQuery(trpc.phoneNumbers.list.queryOptions());
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id })),
      queryClient.invalidateQueries(trpc.phoneNumbers.list.queryFilter()),
    ]);

  const deleteAgent = useMutation(
    trpc.agents.delete.mutationOptions({
      onSuccess: () => router.push("/agents"),
    }),
  );

  const setSection = (section: SectionValue) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", section);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (agent.isLoading) return <AgentDetailSkeleton />;

  if (!agent.data) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconX />
          </EmptyMedia>
          <EmptyTitle>Agent not found</EmptyTitle>
          <EmptyDescription>The agent you requested is not available.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/agents" className={buttonVariants({ variant: "outline" })}>
            <IconArrowLeft data-icon="inline-start" />
            Back to agents
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  const currentAgent = agent.data;
  const assignedNumbers = (currentAgent.phoneNumbers ?? []) as DashboardPhoneNumber[];
  const allNumbers = (phoneNumbers.data ?? []) as DashboardPhoneNumber[];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={currentAgent.name}
        description={
          <>
            <span className="font-mono">{currentAgent.agentId}</span>
            <span className="mx-1.5 opacity-45">·</span>
            {currentAgent.model}
            <span className="mx-1.5 opacity-45">·</span>
            Voice {currentAgent.voiceSpeaker}
          </>
        }
        actions={
          <>
            <Link href="/playground" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Test agent
            </Link>
            <Badge variant={currentAgent.isActive ? "default" : "secondary"} className="text-[11px]">
              {currentAgent.isActive ? "Ready" : "Draft"}
            </Badge>
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
              <BreadcrumbPage>{currentAgent.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="space-y-6">
        <AgentTabs activeSection={activeSection} onSelect={setSection} />
        <div className="min-w-0">
          {activeSection === "prompt" ? <PromptSection agent={currentAgent} agentId={id} /> : null}
          {activeSection === "settings" ? (
            <SettingsSection agent={currentAgent} agentId={id} onDelete={() => setDeleteOpen(true)} />
          ) : null}
          {activeSection === "voice" ? <VoiceSection agent={currentAgent} agentId={id} /> : null}
          {activeSection === "recording" ? <RecordingSection agent={currentAgent} agentId={id} /> : null}
          {activeSection === "tools" ? <ToolsSection agent={currentAgent} agentId={id} /> : null}
          {activeSection === "phone-numbers" ? (
            <PhoneNumbersSection
              agentId={id}
              agentName={currentAgent.name}
              assignedNumbers={assignedNumbers}
              allNumbers={allNumbers}
              onInvalidate={invalidate}
            />
          ) : null}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{currentAgent.name}&rdquo; permanently. Call history remains, but this agent profile cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleteAgent.isPending} onClick={() => deleteAgent.mutate({ id })}>
              {deleteAgent.isPending ? "Deleting" : "Delete agent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AgentTabs({
  activeSection,
  onSelect,
}: {
  activeSection: SectionValue;
  onSelect: (section: SectionValue) => void;
}) {
  const items: { value: SectionValue; label: string }[] = [
    { value: "prompt", label: "Prompt" },
    { value: "voice", label: "Voice" },
    { value: "recording", label: "Recording" },
    { value: "tools", label: "Tools" },
    { value: "phone-numbers", label: "Phone numbers" },
    { value: "settings", label: "Settings" },
  ];

  return (
    <div className="overflow-x-auto border-b" role="tablist" aria-label="Agent sections">
      <div className="flex min-w-max gap-5">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={activeSection === item.value}
            className="border-b-2 border-transparent px-0.5 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
            onClick={() => onSelect(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SideField({
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

function PromptSection({ agent, agentId }: { agent: Record<string, unknown>; agentId: string }) {
  const PROMPT_MAX_CHARS = 200_000;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initialForm: PromptForm = {
    name: (agent.name as string) ?? "",
    agentId: (agent.agentId as string) ?? "",
    prompt: (agent.prompt as string) ?? "",
    initialReply: (agent.initialReply as string) ?? "",
    model: (agent.model as string) ?? "openai/gpt-5.1",
    voiceSpeaker: (agent.voiceSpeaker as string) ?? "ishita",
    voiceDictId: (agent.voiceDictId as string) ?? "",
  };
  const [form, setForm] = useState<PromptForm>(initialForm);
  const [savedForm, setSavedForm] = useState<PromptForm>(initialForm);
  const hasChanges =
    form.name !== savedForm.name ||
    form.agentId !== savedForm.agentId ||
    form.prompt !== savedForm.prompt ||
    form.initialReply !== savedForm.initialReply ||
    form.model !== savedForm.model ||
    form.voiceSpeaker !== savedForm.voiceSpeaker ||
    form.voiceDictId !== savedForm.voiceDictId;
  const overLimit = form.prompt.length > PROMPT_MAX_CHARS;
  const tokenCount = useMemo(() => countTokens(form.prompt), [form.prompt]);
  const update = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: () => {
        setSavedForm(form);
        queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id: agentId }));
        queryClient.invalidateQueries(trpc.agents.list.queryFilter());
      },
    }),
  );
  const saveForm = useCallback(
    () => update.mutate({ id: agentId, data: form }),
    [agentId, update, form],
  );

  const discardChanges = () => setForm(savedForm);
  const setField = <K extends keyof PromptForm>(key: K, value: PromptForm[K]) => {
    setForm({ ...form, [key]: value });
  };

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (hasChanges && !overLimit) saveForm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [form, hasChanges, overLimit, saveForm]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,48rem)_320px]">
      <div className="min-w-0 space-y-8">
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">System prompt</h2>
              <p className="mt-1 text-sm text-muted-foreground">Runtime instructions sent to the voice agent.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {update.isPending ? "Saving" : overLimit ? "Too long" : hasChanges ? "Unsaved" : "Saved"}
              </span>
              {hasChanges && (
                <Button size="sm" variant="outline" onClick={discardChanges}>
                  <IconArrowLeft data-icon="inline-start" />
                  Discard
                </Button>
              )}
              <Button size="sm" disabled={update.isPending || !hasChanges || overLimit} onClick={() => saveForm()}>
                {update.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDeviceFloppy data-icon="inline-start" />}
                Save changes
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/35 px-4 py-2.5">
              <span className="text-sm font-medium">Prompt editor</span>
              <span className={cn("text-xs tabular-nums", overLimit ? "text-destructive" : form.prompt.length > 160_000 ? "text-amber-600" : "text-muted-foreground")}>
                {form.prompt.length.toLocaleString()} chars · {tokenCount.toLocaleString()} tokens
              </span>
            </div>
            <Textarea
              className="min-h-[460px] max-h-[600px] overflow-auto resize-none rounded-none border-0 bg-card p-6 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
              value={form.prompt}
              onChange={(event) => setField("prompt", event.target.value)}
              placeholder="You are a helpful, concise voice agent."
            />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold">First message</h2>
            <p className="mt-1 text-sm text-muted-foreground">How the agent starts each conversation.</p>
          </div>
          <Textarea
            className="min-h-36 font-mono text-sm"
            value={form.initialReply}
            onChange={(event) => setField("initialReply", event.target.value)}
            placeholder="Greet the caller and ask what they want to practice today."
          />
        </section>
      </div>

      <section className="h-fit rounded-xl border bg-card lg:mt-16">
        <SideField title="Name" description="Visible name for operators.">
          <Input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Agent name" />
        </SideField>
        <SideField title="Agent ID" description="Stable ID passed in dispatch metadata.">
          <Input value={form.agentId} onChange={(event) => setField("agentId", sanitizeAgentId(event.target.value))} placeholder="agent-id" className="font-mono" />
        </SideField>
        <SideField title="Model" description="Language model for calls.">
          <ModelSelector value={form.model} onChange={(v) => setField("model", v)} />
        </SideField>
        <SideField title="Speaker" description="TTS provider voice name.">
          <VoiceSelector value={form.voiceSpeaker} onChange={(v) => setField("voiceSpeaker", v)} />
        </SideField>
      </section>
    </div>
  );
}


function SettingsSection({ agent, agentId, onDelete }: { agent: Record<string, unknown>; agentId: string; onDelete: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState((agent.description as string) ?? "");
  const [hasChanges, setHasChanges] = useState(false);

  const update = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id: agentId }));
        queryClient.invalidateQueries(trpc.agents.list.queryFilter());
        setHasChanges(false);
      },
    }),
  );

  return (
    <div className="max-w-3xl space-y-8">
      <section className="rounded-xl border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">Description</h2>
          <p className="mt-1 text-sm text-muted-foreground">Internal note shown to operators.</p>
        </div>
        <Textarea
          rows={5}
          className="mt-4"
          placeholder="Internal note for operators"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setHasChanges(true);
          }}
        />
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={!hasChanges || update.isPending} onClick={() => update.mutate({ id: agentId, data: { description } })}>
            {update.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDeviceFloppy data-icon="inline-start" />}
            Save changes
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-destructive/20 bg-card px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">Permanently delete this agent profile. This cannot be undone.</p>
          </div>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <IconTrash data-icon="inline-start" />
            Delete agent
          </Button>
        </div>
      </section>
    </div>
  );
}

function RecordingSection({ agent, agentId }: { agent: Record<string, unknown>; agentId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initialConfigs = useMemo(() => {
    const raw = agent.egressConfigs;
    if (!Array.isArray(raw)) return [];
    return (raw as { type: string; frameIntervalSec?: number }[]).map((c) => ({
      type: c.type as (typeof EGRESS_TYPES)[number],
      frameIntervalSec: c.frameIntervalSec,
    }));
  }, [agent.egressConfigs]);
  const [egressConfigs, setEgressConfigs] = useState<{ type: (typeof EGRESS_TYPES)[number]; frameIntervalSec?: number }[]>(initialConfigs);
  const [hasChanges, setHasChanges] = useState(false);

  const update = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id: agentId }));
        queryClient.invalidateQueries(trpc.agents.list.queryFilter());
        setHasChanges(false);
      },
    }),
  );

  const availableTypes = useMemo(() => {
    const used = new Set(egressConfigs.map((c) => c.type));
    return EGRESS_TYPES.filter((t) => !used.has(t));
  }, [egressConfigs]);

  const addEgress = (type: (typeof EGRESS_TYPES)[number]) => {
    const next = [...egressConfigs, { type, ...(type === "frames" ? { frameIntervalSec: 5 } : {}) }];
    setEgressConfigs(next);
    setHasChanges(true);
  };

  const removeEgress = (index: number) => {
    const next = egressConfigs.filter((_, i) => i !== index);
    setEgressConfigs(next);
    setHasChanges(true);
  };

  const updateFrameInterval = (index: number, value: number) => {
    const next = egressConfigs.map((c, i) => (i === index ? { ...c, frameIntervalSec: value } : c));
    setEgressConfigs(next);
    setHasChanges(true);
  };

  const EGRESS_LABELS: Record<string, { label: string; description: string; icon: ReactNode }> = {
    audio: { label: "Audio", description: "MP3 recording of the call", icon: <IconMicrophone className="size-4" /> },
    video: { label: "Video", description: "MP4 screen recording", icon: <IconVideo className="size-4" /> },
    frames: { label: "Frames", description: "JPEG snapshots at intervals", icon: <IconPhoto className="size-4" /> },
  };

  const getFrameIntervalLabel = (sec?: number) =>
    FRAME_INTERVAL_PRESETS.find((p) => p.value === sec)?.label ?? `${sec ?? 5}s`;

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">Egress streams</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure which outputs are captured during calls. Each agent can have up to {MAX_EGRESS_COUNT} streams.
          </p>
        </div>

        {egressConfigs.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No egress configured. This agent will not record or capture frames.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {egressConfigs.map((cfg, i) => {
              const meta = EGRESS_LABELS[cfg.type];
              return (
                <Item key={i} variant="outline" size="sm">
                  <ItemMedia variant="icon">{meta?.icon}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{meta?.label ?? cfg.type}</ItemTitle>
                    <ItemDescription>
                      {cfg.type === "frames"
                        ? `${meta?.description} — ${getFrameIntervalLabel(cfg.frameIntervalSec)}`
                        : meta?.description}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {cfg.type === "frames" && (
                      <Select
                        value={String(cfg.frameIntervalSec ?? 5)}
                        onValueChange={(v) => updateFrameInterval(i, Number(v))}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FRAME_INTERVAL_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={String(p.value)}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => removeEgress(i)}>
                      <IconX className="size-4" />
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </div>
        )}

        {availableTypes.length > 0 && egressConfigs.length < MAX_EGRESS_COUNT && (
          <div className="mt-5 flex flex-wrap gap-2">
            {availableTypes.map((type) => (
              <Button key={type} variant="outline" size="sm" onClick={() => addEgress(type)}>
                <IconPlus className="mr-1 h-3 w-3" />
                {type === "audio" ? "Audio (MP3)" : type === "video" ? "Video (MP4)" : "Frames (JPEG)"}
              </Button>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-end pt-2">
        <Button size="sm" disabled={!hasChanges || update.isPending} onClick={() => update.mutate({ id: agentId, data: { egressConfigs } })}>
          {update.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDeviceFloppy data-icon="inline-start" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function VoiceSection({ agent, agentId }: { agent: Record<string, unknown>; agentId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [model, setModel] = useState((agent.model as string) ?? "openai/gpt-4.1");
  const [voiceSpeaker, setVoiceSpeaker] = useState((agent.voiceSpeaker as string) ?? "ishita");
  const [voiceDictId, setVoiceDictId] = useState((agent.voiceDictId as string) ?? "");
  const [hasChanges, setHasChanges] = useState(false);

  const update = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id: agentId }));
        queryClient.invalidateQueries(trpc.agents.list.queryFilter());
        setHasChanges(false);
      },
    }),
  );

  return (
    <section className="max-w-3xl space-y-6">
      <SettingsRow title="Model" description="Language model used for live calls.">
        <ModelSelector value={model} onChange={(v) => { setModel(v); setHasChanges(true); }} />
      </SettingsRow>
      <SettingsRow title="Speaker" description="Speaker name maps to your TTS provider voice.">
        <VoiceSelector value={voiceSpeaker} onChange={(v) => { setVoiceSpeaker(v); setHasChanges(true); }} />
      </SettingsRow>
      <SettingsRow title="Voice dict ID" description="Optional dictionary identifier.">
        <Input value={voiceDictId} onChange={(event) => { setVoiceDictId(event.target.value); setHasChanges(true); }} placeholder="Optional" />
      </SettingsRow>
      <div className="flex justify-end">
        <Button size="sm" disabled={!hasChanges || update.isPending} onClick={() => update.mutate({ id: agentId, data: { model, voiceSpeaker, voiceDictId } })}>
          {update.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDeviceFloppy data-icon="inline-start" />}
          Save changes
        </Button>
      </div>
    </section>
  );
}

function ToolsSection({ agent, agentId }: { agent: Record<string, unknown>; agentId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [knowledgeBaseCollection, setKnowledgeBaseCollection] = useState((agent.knowledgeBaseCollection as string | null) ?? "");
  const [knowledgeHasChanges, setKnowledgeHasChanges] = useState(false);
  const knowledgeBaseEnabled = Boolean(agent.knowledgeBaseCollection);

  const invalidateAgent = () => queryClient.invalidateQueries(trpc.agents.byId.queryFilter({ id: agentId }));
  const endCallTool = useMutation(trpc.agents.update.mutationOptions({ onSuccess: invalidateAgent }));
  const memoryTool = useMutation(trpc.agents.update.mutationOptions({ onSuccess: invalidateAgent }));
  const knowledgeTool = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: () => {
        invalidateAgent();
        setKnowledgeHasChanges(false);
      },
    }),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">End call tool</h2>
            <p className="mt-1 text-sm text-muted-foreground">Allow the agent to terminate the call when the conversation is complete.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{agent.endCallEnabled ? "Enabled" : "Disabled"}</span>
            <Switch
              checked={Boolean(agent.endCallEnabled)}
              onCheckedChange={(value) => endCallTool.mutate({ id: agentId, data: { endCallEnabled: value } })}
              disabled={endCallTool.isPending}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">Allow the agent to retain context across conversation turns.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{agent.memoryEnabled ? "Enabled" : "Disabled"}</span>
            <Switch
              checked={Boolean(agent.memoryEnabled)}
              onCheckedChange={(value) => memoryTool.mutate({ id: agentId, data: { memoryEnabled: value } })}
              disabled={memoryTool.isPending}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Knowledge base</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enable retrieval using a saved collection name.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{knowledgeBaseEnabled ? "Enabled" : "Disabled"}</span>
            <Switch
              checked={knowledgeBaseEnabled}
              onCheckedChange={(value) => {
                if (value) {
                  const collection = knowledgeBaseCollection.trim();
                  if (!collection) {
                    setKnowledgeHasChanges(true);
                    return;
                  }
                  knowledgeTool.mutate({ id: agentId, data: { knowledgeBaseCollection: collection } });
                  return;
                }
                knowledgeTool.mutate({ id: agentId, data: { knowledgeBaseCollection: "" } });
              }}
              disabled={knowledgeTool.isPending}
            />
          </div>
        </div>
        {!knowledgeBaseEnabled && !knowledgeBaseCollection.trim() ? (
          <p className="mt-4 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Add a collection name before enabling this tool.</p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <Input
            value={knowledgeBaseCollection}
            onChange={(event) => {
              setKnowledgeBaseCollection(event.target.value);
              setKnowledgeHasChanges(true);
            }}
            placeholder="Collection name"
          />
          <Button
            size="sm"
            disabled={!knowledgeHasChanges || knowledgeTool.isPending}
            onClick={() => knowledgeTool.mutate({ id: agentId, data: { knowledgeBaseCollection: knowledgeBaseCollection.trim() } })}
          >
            {knowledgeTool.isPending ? <IconLoader className="animate-spin" data-icon="inline-start" /> : <IconDeviceFloppy data-icon="inline-start" />}
            Save collection
          </Button>
        </div>
      </section>
    </div>
  );
}

function PhoneNumbersSection({
  agentId,
  agentName,
  assignedNumbers,
  allNumbers,
  onInvalidate,
}: {
  agentId: string;
  agentName: string;
  assignedNumbers: DashboardPhoneNumber[];
  allNumbers: DashboardPhoneNumber[];
  onInvalidate: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedNumberId, setSelectedNumberId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  const assignNumber = useMutation(
    trpc.phoneNumbers.assign.mutationOptions({
      onSuccess: () => {
        setSelectedNumberId("");
        setAssignError(null);
        setAssignOpen(false);
        onInvalidate();
      },
      onError: (error) => setAssignError(error.message),
    }),
  );

  const unassignNumber = useMutation(trpc.phoneNumbers.update.mutationOptions({ onSuccess: onInvalidate }));
  const availableNumbers = allNumbers.filter((number) => !number.agentId || number.agentId === agentId);
  const unassignedNumbers = availableNumbers.filter((number) => !number.agentId);

  return (
    <div className="grid max-w-[69.75rem] gap-7 lg:grid-cols-[48rem_320px]">
      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Assigned numbers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {assignedNumbers.length ? `${assignedNumbers.length} number${assignedNumbers.length === 1 ? "" : "s"} routing to this agent.` : "No numbers route to this agent yet."}
            </p>
          </div>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <IconPlus data-icon="inline-start" />
              Assign number
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign phone number</DialogTitle>
                <DialogDescription>Select an unassigned Vobiz number to route inbound calls to {agentName}.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Select
                  value={selectedNumberId}
                  onValueChange={(value) => {
                    setSelectedNumberId(value ?? "");
                    setAssignError(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {unassignedNumbers.map((number) => (
                        <SelectItem key={number.id} value={number.id}>
                          {number.e164}{number.label ? `, ${number.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {assignError ? <p className="text-sm text-destructive">{assignError}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setAssignOpen(false); setAssignError(null); }}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!selectedNumberId || assignNumber.isPending}
                    onClick={() => {
                      if (!selectedNumberId) return;
                      assignNumber.mutate({ phoneNumberId: selectedNumberId, agentId });
                    }}
                  >
                    {assignNumber.isPending ? "Assigning" : "Assign number"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {assignedNumbers.length === 0 ? (
          <Empty className="rounded-none border-0 p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconPhone /></EmptyMedia>
              <EmptyTitle>No assigned numbers</EmptyTitle>
              <EmptyDescription>Assign a number when this agent should receive inbound calls.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {assignedNumbers.map((number) => (
              <div key={number.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{number.e164}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {number.label ?? "No label"}
                    {number.connection?.livekitOutboundTrunkId ? `, trunk ${number.connection.livekitOutboundTrunkId}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit text-destructive hover:text-destructive"
                  disabled={unassignNumber.isPending}
                  onClick={() => unassignNumber.mutate({ id: number.id, data: { agentId: null } })}
                >
                  <IconPhoneOff data-icon="inline-start" />
                  Unassign
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="h-fit rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">Routing notes</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Phone assignments connect imported inventory to this agent. Use the phone numbers page to import inventory before assigning.</p>
        <Link href="/phone-numbers" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}>
          Manage phone numbers
        </Link>
      </aside>
    </div>
  );
}
