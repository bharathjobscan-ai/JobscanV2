import Anthropic from "@anthropic-ai/sdk";

import { getEnv } from "@/lib/config/env";
import { flattenPrompt, type BuiltPrompt } from "./prompts";
import { parseTaskResponse, type AiProvider, type TaskContext, type TaskResult } from "./types";

/**
 * Anthropic API driver.
 *
 * Like Gemini and unlike the retired local worker, this is a plain HTTPS call,
 * so it runs inline and works from Vercel.
 *
 * The prompt arrives already split. The stable half — skill, master resume,
 * output contract — goes in `system` behind a cache breakpoint; only the job
 * varies. After the first call of a session the prefix bills at a tenth of
 * input rate, which matters because the CVG skill and master resume are ~5k
 * tokens on every request.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic_api";

  async run(
    context: TaskContext,
    prompt: string | BuiltPrompt,
    model: string,
  ): Promise<TaskResult> {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local to use anthropic_api.",
      );
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const split =
      typeof prompt === "string" ? { system: "", user: prompt } : prompt;

    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      // Thinking is adaptive by default on Opus 5; effort is the cost lever.
      output_config: { effort: env.AI_EFFORT },
      system: [
        {
          type: "text",
          text: split.system || flattenPrompt(split),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: split.user }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `Claude declined this request (${response.stop_details?.category ?? "unspecified"}).`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) throw new Error("Claude returned an empty response");

    const parsed = parseTaskResponse(text);
    const u = response.usage;

    return {
      payload: parsed.payload,
      markdown: parsed.markdown,
      model,
      provider: this.name,
      usage: {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
