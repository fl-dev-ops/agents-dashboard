"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface ModelOption {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "google" | "other";
}

const MODELS: ModelOption[] = [
  // OpenAI
  { id: "openai/gpt-5.5", label: "GPT-5.5", provider: "openai" },
  { id: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", provider: "openai" },
  { id: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro", provider: "openai" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" },
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" },
  { id: "openai/gpt-5.3-chat", label: "GPT-5.3 Chat", provider: "openai" },
  { id: "openai/gpt-5.3", label: "GPT-5.3", provider: "openai" },
  { id: "openai/gpt-5.2", label: "GPT-5.2", provider: "openai" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", provider: "openai" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", provider: "openai" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openai" },
  // Anthropic
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "anthropic/claude-sonnet-4.8", label: "Claude Sonnet 4.8", provider: "anthropic" },
  { id: "anthropic/claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "anthropic/claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", provider: "anthropic" },
  // Google
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
  { id: "google/gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "google" },
  { id: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
  // DeepSeek
  { id: "deepseek/deepseek-v3-0324", label: "DeepSeek V3", provider: "other" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "other" },
];

const PROVIDER_LABELS: Record<ModelOption["provider"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  other: "Other",
};

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return MODELS;
    const q = search.toLowerCase();
    return MODELS.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    for (const model of filtered) {
      if (!groups[model.provider]) groups[model.provider] = [];
      groups[model.provider].push(model);
    }
    return groups;
  }, [filtered]);

  const selected = MODELS.find((m) => m.id === value);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm transition-colors hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selected?.label ?? value ?? "Select model"}</span>
        <IconChevronDown className={cn("size-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="border-b px-2 py-1.5">
            <div className="relative">
              <IconSearch className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                placeholder="Search models…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-sm bg-transparent pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1">
            {Object.entries(grouped).map(([provider, models]) => (
              <div key={provider} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {PROVIDER_LABELS[provider as ModelOption["provider"]]}
                </p>
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                      value === model.id && "bg-accent",
                    )}
                  >
                    <span className={cn("flex-1 truncate text-left", value === model.id && "font-medium")}>
                      {model.label}
                    </span>
                    {value === model.id && (
                      <IconCheck className="size-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
