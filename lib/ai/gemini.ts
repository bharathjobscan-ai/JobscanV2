import { GoogleGenAI } from "@google/genai";

import { getEnv } from "@/lib/config/env";
import { parseTaskResponse, type AiProvider, type TaskContext, type TaskResult } from "./types";

/**
 * Gemini API driver.
 *
 * Unlike `claude_local`, this needs no worker: it is a plain HTTPS call with an
 * API key, so it runs inline in the request and works from Vercel. That is the
 * substantive difference between the two paths — the local worker exists only
 * because Vercel cannot spawn Claude Code.
 *
 * Google Search grounding is enabled for scoring. ScoreG verifies sponsor
 * registry status and hiring signals live, and grounding is the closest
 * equivalent to the WebSearch tool the Claude Code path uses — which matters
 * for a like-for-like benchmark.
 */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini_api";

  async run(
    context: TaskContext,
    prompt: string | { system: string; user: string },
    model: string,
  ): Promise<TaskResult> {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=gemini_api.",
      );
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    // Scoring needs live evidence; CV and cover letter work from the JD and
    // master resume alone, and granting tools there only adds latency.
    const tools = context.taskType === "score" ? [{ googleSearch: {} }] : undefined;

    // Gemini has no equivalent cache breakpoint here, so the split halves are
    // simply concatenated.
    const contents =
      typeof prompt === "string" ? prompt : `${prompt.system}\n\n${prompt.user}`;

    const response = await ai.models.generateContent({
      model,
      contents,
      config: tools ? { tools } : {},
    });

    const text = response.text ?? "";
    if (!text.trim()) {
      throw new Error("Gemini returned an empty response");
    }

    const parsed = parseTaskResponse(text);
    const u = response.usageMetadata;

    return {
      payload: parsed.payload,
      markdown: parsed.markdown,
      model,
      provider: this.name,
      usage: {
        inputTokens: u?.promptTokenCount ?? 0,
        outputTokens: u?.candidatesTokenCount ?? 0,
        // Gemini reports reasoning tokens separately; they are billed as output.
        thinkingTokens: u?.thoughtsTokenCount ?? 0,
        cacheReadTokens: u?.cachedContentTokenCount ?? 0,
        cacheCreationTokens: 0,
      },
    };
  }
}

/** Available models, for choosing one without guessing at names. */
export async function listGeminiModels(): Promise<string[]> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const names: string[] = [];

  for await (const model of await ai.models.list()) {
    if (model.name) names.push(model.name.replace(/^models\//, ""));
  }
  return names.sort();
}
