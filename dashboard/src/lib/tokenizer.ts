import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";

// o200k_base is the encoding for GPT-4o-mini, GPT-5, and newer OpenAI models.
// For GPT-4 / Claude (cl100k_base), swap the rank table import and the
// constructor argument.  The count difference for English text is < 5%.
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) encoder = new Tiktoken(o200k_base);
  return encoder;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return getEncoder().encode(text).length;
  } catch {
    // Graceful fallback: ~4 chars per token (conservative English estimate).
    return Math.ceil(text.length / 4);
  }
}
