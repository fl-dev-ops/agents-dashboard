"use client";

import { SearchSelect, type SearchSelectItem } from "@/components/dashboard/search-select";

interface ModelOption {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "google" | "other";
}

const MODELS: ModelOption[] = [
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
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "anthropic/claude-sonnet-4.8", label: "Claude Sonnet 4.8", provider: "anthropic" },
  { id: "anthropic/claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "anthropic/claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
  { id: "google/gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "google" },
  { id: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
  { id: "deepseek/deepseek-v3-0324", label: "DeepSeek V3", provider: "other" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "other" },
];

const PROVIDER_LABELS: Record<ModelOption["provider"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  other: "Other",
};

const MODEL_ITEMS: SearchSelectItem[] = MODELS.map((m) => ({
  value: m.id,
  label: m.label,
  sublabel: PROVIDER_LABELS[m.provider],
}));

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ModelSelector({ value, onChange, className = "w-full" }: ModelSelectorProps) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={MODEL_ITEMS}
      placeholder="Select model"
      searchPlaceholder="Search models…"
      className={className}
    />
  );
}
