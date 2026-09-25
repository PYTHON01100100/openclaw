/**
 * HUMAIN Node provider plugin entrypoint.
 */
import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";
import { applyHumainConfig } from "./onboard.js";
import manifest from "./openclaw.plugin.json" with { type: "json" };
import { buildHumainProvider, HUMAIN_MODEL_DISCOVERY } from "./provider-catalog.js";

const PROVIDER_ID = "humain";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "HUMAIN Node Provider",
  description: "Bundled HUMAIN Node provider plugin",
  manifest,
  provider: {
    label: "HUMAIN Node",
    docsPath: "/providers/humain",
    manifestAuth: {
      applyConfig: applyHumainConfig,
      noteMessage: [
        "HUMAIN Node is HUMAIN's AI access platform: an interactive playground",
        "plus an OpenAI-compatible API brokering multiple providers/models.",
        "Create a User API key from the Users page for your Team in HUMAIN Node.",
      ].join("\n"),
      noteTitle: "HUMAIN Node",
    },
    catalog: {
      buildProvider: buildHumainProvider,
      discoveryMode: "strict",
      allowExplicitBaseUrl: true,
      liveModelDiscovery: HUMAIN_MODEL_DISCOVERY,
    },
    // HUMAIN Node's documented error codes disambiguate cases the generic
    // status/message classifier cannot: a weekly cap or partner credit limit
    // is a billing stop, not a transient rate limit that a quick retry clears.
    // Codes outside this set fall through to generic HTTP-status classification.
    classifyFailoverReason: ({ code }) => {
      switch (code) {
        case "quota_exceeded":
        case "weekly_cap_exceeded":
        case "partner_credit_limit_exceeded":
          return "billing";
        case "rate_limit_exceeded":
          return "rate_limit";
        case "model_not_found":
          return "model_not_found";
        default:
          return undefined;
      }
    },
  },
});
