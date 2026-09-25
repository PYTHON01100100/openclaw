// HUMAIN Node live test proves a real round trip against api.node.humain.com.
import { completeSimple, type Model } from "openclaw/plugin-sdk/llm";
import { isTruthyEnvValue } from "openclaw/plugin-sdk/runtime-env";
import { beforeAll, describe, expect, it } from "vitest";
import { HUMAIN_BASE_URL } from "./provider-catalog.js";

const HUMAIN_KEY = process.env.HUMAIN_NODE_API_KEY ?? "";
const LIVE = ["LIVE", "OPENCLAW_LIVE_TEST", "HUMAIN_LIVE_TEST"].some((name) =>
  isTruthyEnvValue(process.env[name]),
);
const HUMAIN_LIVE_TIMEOUT_MS = 45_000;

const describeLive = LIVE && HUMAIN_KEY ? describe : describe.skip;

function extractAssistantText(
  content: Array<{
    type?: string;
    text?: string;
  }>,
) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

describeLive("humain live catalog", () => {
  let modelId: string | undefined;

  beforeAll(async () => {
    const response = await fetch(`${HUMAIN_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${HUMAIN_KEY}` },
    });
    if (!response.ok) {
      throw new Error(`GET /models failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    modelId = body.data?.[0]?.id;
  }, HUMAIN_LIVE_TIMEOUT_MS);

  it(
    "lists at least one model for this key",
    () => {
      expect(modelId).toBeTruthy();
    },
    HUMAIN_LIVE_TIMEOUT_MS,
  );

  it(
    "returns assistant text from the first listed model",
    async () => {
      if (!modelId) {
        throw new Error("expected a HUMAIN Node model id from GET /models");
      }
      const model = {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: "humain",
        baseUrl: HUMAIN_BASE_URL,
        input: ["text"],
        contextWindow: 8192,
        maxTokens: 1024,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      } satisfies Model<"openai-completions">;
      const context = {
        messages: [
          {
            role: "user" as const,
            content: "Reply with the word ok.",
            timestamp: Date.now(),
          },
        ],
      };
      const response = await completeSimple(model, context, {
        apiKey: HUMAIN_KEY,
        maxTokens: 128,
      });
      const text = extractAssistantText(response.content);
      expect(text.length).toBeGreaterThan(0);
    },
    HUMAIN_LIVE_TIMEOUT_MS,
  );
});
