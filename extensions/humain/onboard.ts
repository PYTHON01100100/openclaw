// HUMAIN Node setup module handles plugin onboarding behavior.
import { createProviderConnectionPresetAppliers } from "openclaw/plugin-sdk/provider-onboard";
import { HUMAIN_BASE_URL } from "./provider-catalog.js";

/**
 * HUMAIN Node has no fixed default model: it brokers a live, per-key catalog
 * across multiple upstream providers (`GET /models`), so there is no single
 * model id that is guaranteed to exist for every key/tier. Onboarding wires
 * up the connection (base URL + API key) only; pick a model afterward from
 * `openclaw models` once live discovery has run.
 */
export const HUMAIN_DEFAULT_MODEL_REF = "";

export const { applyConfig: applyHumainConfig } = createProviderConnectionPresetAppliers<[]>({
  primaryModelRef: HUMAIN_DEFAULT_MODEL_REF,
  resolveParams: () => ({
    providerId: "humain",
    api: "openai-completions",
    baseUrl: HUMAIN_BASE_URL,
    catalogModels: [],
    aliases: [],
  }),
});
