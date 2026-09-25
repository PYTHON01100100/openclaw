import { registerSingleProviderPlugin } from "openclaw/plugin-sdk/plugin-test-runtime";
import {
  clearLiveCatalogCacheForTests,
  type LiveModelCatalogFetchGuard,
} from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import type { ProviderPlugin } from "openclaw/plugin-sdk/provider-model-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeSpies } from "../test-support/runtime-spies.js";
import { applyHumainConfig } from "./onboard.js";
import plugin from "./index.js";
import { resolveHumainStarterModel } from "./provider-catalog.js";

const ssrfRuntimeMocks = vi.hoisted(() => ({
  fetchWithSsrFGuard: vi.fn<LiveModelCatalogFetchGuard>(),
}));

vi.mock("openclaw/plugin-sdk/ssrf-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openclaw/plugin-sdk/ssrf-runtime")>()),
  ...ssrfRuntimeMocks,
}));

const HUMAIN_MODELS_URL = "https://api.node.humain.com/v1/models";
const NATIVE_TEXT_MODEL = {
  id: "fixture-text-model",
  object: "model",
  owned_by: "fixture-upstream",
  node: {
    max_context_tokens: 131072,
    max_output_tokens: 8192,
    supports_streaming: true,
    supports_function_calling: true,
    supports_images: false,
  },
};

type CatalogContext = Parameters<NonNullable<ProviderPlugin["catalog"]>["run"]>[0];

function createCatalogContext(overrides: Partial<CatalogContext> = {}): CatalogContext {
  return {
    config: {},
    env: {},
    resolveProviderApiKey: () => ({
      apiKey: "fixture-humain-key",
      discoveryApiKey: "fixture-discovery-key",
      profileId: "humain:fixture-profile",
    }),
    resolveProviderAuth: () => ({
      apiKey: "fixture-humain-key",
      discoveryApiKey: "fixture-discovery-key",
      mode: "api_key",
      source: "env",
    }),
    ...overrides,
  };
}

function mockCatalogResponse(body: unknown, init?: ResponseInit) {
  ssrfRuntimeMocks.fetchWithSsrFGuard.mockImplementation(async ({ url }) => ({
    response: Response.json(body, init),
    finalUrl: url,
    release: async () => {},
  }));
}

async function runHumainCatalog(ctx = createCatalogContext()) {
  const provider = await registerSingleProviderPlugin(plugin);
  const result = await provider.catalog?.run(ctx);
  if (!result || !("provider" in result)) {
    throw new Error("expected authenticated HUMAIN Node provider catalog");
  }
  return result.provider;
}

beforeEach(() => {
  clearLiveCatalogCacheForTests();
});

afterEach(() => {
  clearLiveCatalogCacheForTests();
  ssrfRuntimeMocks.fetchWithSsrFGuard.mockReset();
});

describe("HUMAIN Node starter model resolution", () => {
  it("resolves a live model as a starter ref, deterministically by id", async () => {
    mockCatalogResponse({
      data: [NATIVE_TEXT_MODEL, { ...NATIVE_TEXT_MODEL, id: "fixture-earlier-model" }],
    });

    await expect(resolveHumainStarterModel({ apiKey: "fixture-humain-key" })).resolves.toBe(
      "humain/fixture-earlier-model",
    );
  });

  it("respects a configured custom base URL", async () => {
    mockCatalogResponse({ data: [NATIVE_TEXT_MODEL] });

    await resolveHumainStarterModel({
      apiKey: "fixture-humain-key",
      baseUrl: "https://proxy.example.test/humain/v1",
    });

    expect(ssrfRuntimeMocks.fetchWithSsrFGuard.mock.calls[0]?.[0]?.url).toBe(
      "https://proxy.example.test/humain/v1/models",
    );
  });

  it("returns undefined when the key has no available models", async () => {
    mockCatalogResponse({ data: [] });

    await expect(
      resolveHumainStarterModel({ apiKey: "fixture-humain-key" }),
    ).resolves.toBeUndefined();
  });

  it("completes non-interactive setup by picking a live starter model", async () => {
    mockCatalogResponse({ data: [NATIVE_TEXT_MODEL] });
    const provider = await registerSingleProviderPlugin(plugin);
    const method = provider.auth?.[0];
    if (!method?.runNonInteractive) {
      throw new Error("expected HUMAIN Node non-interactive auth method");
    }

    const config = {};
    const result = await method.runNonInteractive({
      authChoice: "humain-api-key",
      config,
      baseConfig: config,
      opts: {},
      runtime: createRuntimeSpies(),
      resolveApiKey: vi.fn(async () => ({ key: "fixture-humain-key", source: "profile" as const })),
      toApiKeyCredential: vi.fn(() => null),
    });

    expect(result?.agents?.defaults?.model).toEqual({ primary: "humain/fixture-text-model" });
  });
});

describe("HUMAIN Node failover classification", () => {
  it.each([
    ["quota_exceeded", "billing"],
    ["weekly_cap_exceeded", "billing"],
    ["partner_credit_limit_exceeded", "billing"],
    ["rate_limit_exceeded", "rate_limit"],
    ["model_not_found", "model_not_found"],
  ] as const)("classifies code %s as %s", async (code, expected) => {
    const provider = await registerSingleProviderPlugin(plugin);
    expect(
      provider.classifyFailoverReason?.({ errorMessage: "fixture", code }),
    ).toBe(expected);
  });

  it("leaves unrecognized codes to generic HTTP-status classification", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    expect(
      provider.classifyFailoverReason?.({ errorMessage: "fixture", code: "invalid_body" }),
    ).toBeUndefined();
  });
});

describe("HUMAIN Node onboarding", () => {
  it("wires up the connection without forcing a default model", () => {
    const config = applyHumainConfig({});

    expect(config.models?.providers?.humain).toMatchObject({
      baseUrl: "https://api.node.humain.com/v1",
      api: "openai-completions",
    });
    expect(config.agents?.defaults?.model).toBeUndefined();
  });

  it("preserves an existing default model and connection on reapply", () => {
    const config = {
      agents: { defaults: { model: { primary: "anthropic/claude-sonnet-4-6" } } },
    };

    const reapplied = applyHumainConfig(config);

    expect(reapplied.agents?.defaults?.model).toEqual(config.agents.defaults.model);
    expect(reapplied.models?.providers?.humain?.baseUrl).toBe("https://api.node.humain.com/v1");
  });
});

describe("HUMAIN Node live catalog", () => {
  it("discovers live models from GET /models node capability fields", async () => {
    mockCatalogResponse({
      object: "list",
      data: [
        NATIVE_TEXT_MODEL,
        {
          ...NATIVE_TEXT_MODEL,
          id: "fixture-vision-model",
          node: { ...NATIVE_TEXT_MODEL.node, supports_images: true, max_context_tokens: 262144 },
        },
      ],
    });

    const catalog = await runHumainCatalog();

    expect(ssrfRuntimeMocks.fetchWithSsrFGuard).toHaveBeenCalledOnce();
    const request = ssrfRuntimeMocks.fetchWithSsrFGuard.mock.calls[0]?.[0];
    expect(request?.url).toBe(HUMAIN_MODELS_URL);
    expect(catalog).toMatchObject({
      apiKey: "fixture-humain-key",
      api: "openai-completions",
      baseUrl: "https://api.node.humain.com/v1",
    });
    expect(catalog.models).toEqual([
      expect.objectContaining({
        id: "fixture-text-model",
        input: ["text"],
        contextWindow: 131072,
        maxTokens: 8192,
        compat: { supportsTools: true },
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      expect.objectContaining({
        id: "fixture-vision-model",
        input: ["text", "image"],
        contextWindow: 262144,
      }),
    ]);
  });

  it("drops rows missing required context/output limits", async () => {
    mockCatalogResponse({
      data: [{ id: "broken-model", object: "model", node: { supports_streaming: true } }],
    });

    const catalog = await runHumainCatalog();

    expect(catalog.models).toEqual([]);
  });

  it("keeps the runtime catalog inactive without a HUMAIN credential", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    const ctx = createCatalogContext({
      resolveProviderApiKey: () => ({ apiKey: undefined }),
      resolveProviderAuth: () => ({ apiKey: undefined, mode: "none", source: "none" }),
    });

    await expect(provider.catalog?.run(ctx)).resolves.toBeNull();
    expect(ssrfRuntimeMocks.fetchWithSsrFGuard).not.toHaveBeenCalled();
  });

  it("does not resolve credentials or query metadata for an unrelated provider scope", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    const resolveProviderApiKey = vi.fn<CatalogContext["resolveProviderApiKey"]>();
    const resolveProviderAuth = vi.fn<CatalogContext["resolveProviderAuth"]>();
    const ctx = createCatalogContext({
      providerIds: ["fixture-other-provider"],
      resolveProviderApiKey,
      resolveProviderAuth,
    });

    await expect(provider.catalog?.run(ctx)).resolves.toBeNull();
    expect(resolveProviderApiKey).not.toHaveBeenCalled();
    expect(resolveProviderAuth).not.toHaveBeenCalled();
    expect(ssrfRuntimeMocks.fetchWithSsrFGuard).not.toHaveBeenCalled();
  });
});
