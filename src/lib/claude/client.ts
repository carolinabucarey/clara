// Server-side Anthropic client. The base URL is explicit on purpose: some
// environments set ANTHROPIC_BASE_URL for other tools, and Clara must always call
// the public API with its own key.

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

export function hasClaude(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function claude(): Anthropic {
  if (!hasClaude()) throw new Error("missing_anthropic_key");
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
    baseURL: process.env.CLARA_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    timeout: 60_000,
    maxRetries: 1,
  });
  return client;
}
