import OpenAI from "openai";

import { requireOpenAIEnv } from "@/lib/env";

export type EvaluationInput = {
  /** System message — the evaluation prompt */
  prompt: string;
  /** User message — the call transcript as formatted text */
  transcript: string;
  /** JSON Schema for the structured output */
  schema: Record<string, unknown>;
  /** Model to use (e.g. "gpt-4o-mini", "google/gemini-2.5-flash") */
  model: string;
};

export type EvaluationResult = {
  result: Record<string, unknown> | null;
  error: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  durationMs: number;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Remove API keys and sensitive tokens from error messages. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Mask anything that looks like an API key
  return raw
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-****")
    .replace(/Bearer [a-zA-Z0-9_.-]{20,}/g, "Bearer ****");
}

/**
 * Run an evaluation: send transcript + prompt to an LLM with structured output.
 * Uses OpenRouter as the API gateway (OpenAI-compatible).
 */
export async function runEvaluation(input: EvaluationInput): Promise<EvaluationResult> {
  const { apiKey } = requireOpenAIEnv();
  const client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });

  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: input.model,
      messages: [
        { role: "system", content: input.prompt },
        { role: "user", content: input.transcript },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "evaluation_result",
          strict: true,
          schema: input.schema,
        },
      },
    });

    const choice = response.choices[0];
    const durationMs = Date.now() - start;
    const usage = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null;

    // Handle refusal
    if (choice.message.refusal) {
      return { result: null, error: choice.message.refusal, usage, durationMs };
    }

    const content = choice.message.content;
    if (!content) {
      return { result: null, error: "Empty response from model", usage, durationMs };
    }

    const result = JSON.parse(content) as Record<string, unknown>;
    return { result, error: null, usage, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error("Evaluation error:", sanitizeError(err));
    return { result: null, error: sanitizeError(err), usage: null, durationMs };
  }
}

/**
 * Extract transcript turns into a clean text format for the evaluation prompt.
 * Format: [Agent]: text / [User]: text
 */
export function formatTranscriptForEvaluation(transcript: unknown): string {
  if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) return "";

  const turns = (transcript as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) return "";

  const lines: string[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== "object" || !("text" in turn)) continue;
    const { role, text } = turn as { role?: string; text?: string };
    if (!text) continue;

    const label = role === "user" ? "User" : role === "agent" ? "Agent" : (role ?? "Unknown");
    lines.push(`[${label}]: ${text}`);
  }

  return lines.join("\n");
}
