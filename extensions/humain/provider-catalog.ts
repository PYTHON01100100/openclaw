// HUMAIN Node provider module implements model/runtime integration.
import {
  fetchLiveProviderModelRows,
  type OpenAICompatibleModelDiscoveryOptions,
} from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-shared";
import {
  asOptionalRecord,
  asPositiveSafeInteger,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/string-coerce-runtime";

/** Fixed HUMAIN Node inference base; every endpoint in the spec hangs off this `/v1` root. */
export const HUMAIN_BASE_URL = "https://api.node.humain.com/v1";

/**
 * Projects HUMAIN Node's `GET /models` rows into model definitions.
 *
 * HUMAIN Node brokers many upstream providers behind one key, so the catalog
 * is fully live-discovered: there is no bundled static model list to merge
 * against, and no per-model pricing is published by the endpoint, so cost
 * stays at the shared "unknown price" placeholder rather than a guess.
 */
export function projectHumainModels(rows: readonly unknown[]): ModelDefinitionConfig[] {
  const models = new Map<string, ModelDefinitionConfig>();
  for (const row of rows) {
    const record = asOptionalRecord(row);
    const id = normalizeOptionalString(record?.id);
    const node = asOptionalRecord(record?.node);
    const contextWindow = asPositiveSafeInteger(node?.max_context_tokens);
    const maxTokens = asPositiveSafeInteger(node?.max_output_tokens);
    if (
      !record ||
      !id ||
      id.length > 512 ||
      /[\s\p{Cc}]/u.test(id) ||
      (record.object !== undefined && record.object !== "model") ||
      !contextWindow ||
      !maxTokens
    ) {
      continue;
    }
    models.set(id, {
      id,
      name: id,
      // HUMAIN Node's model listing does not publish a reasoning capability flag.
      reasoning: false,
      input: node?.supports_images === true ? ["text", "image"] : ["text"],
      contextWindow,
      maxTokens,
      // Node does not publish per-model pricing; keep the unknown placeholder
      // rather than assert a free-billing or guessed rate.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        ...(typeof node?.supports_function_calling === "boolean"
          ? { supportsTools: node.supports_function_calling }
          : {}),
      },
    });
  }
  return [...models.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

export const HUMAIN_MODEL_DISCOVERY: OpenAICompatibleModelDiscoveryOptions = {
  projectRows: projectHumainModels,
};

/** Builds the HUMAIN Node OpenAI-compatible provider config with no bundled static models. */
export function buildHumainProvider(): ModelProviderConfig {
  return { baseUrl: HUMAIN_BASE_URL, api: "openai-completions", models: [] };
}

/**
 * Resolves a starter model ref right after a HUMAIN Node key is captured, by
 * calling the same `GET /models` this key will use for real inference. There
 * is no fixed default to fall back on (see {@link buildHumainProvider}), so
 * onboarding needs this to have a model to run its first verification turn
 * against. Returns `undefined` when the key has no available models yet.
 */
export async function resolveHumainStarterModel(params: {
  apiKey: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string | undefined> {
  const baseUrl = (params.baseUrl?.trim() || HUMAIN_BASE_URL).replace(/\/+$/, "");
  const rows = await fetchLiveProviderModelRows({
    providerId: "humain",
    endpoint: `${baseUrl}/models`,
    discoveryApiKey: params.apiKey,
    requireHttps: true,
    ...(params.signal ? { signal: params.signal } : {}),
  });
  const [model] = projectHumainModels(rows);
  return model ? `humain/${model.id}` : undefined;
}
