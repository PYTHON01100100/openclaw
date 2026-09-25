# OpenClaw HUMAIN Node Provider

Bundled OpenClaw provider plugin for [HUMAIN Node](https://github.com/PYTHON01100100/openclaw/tree/main/extensions),
HUMAIN's AI access platform: an interactive playground plus an
OpenAI-compatible API brokering multiple providers/models behind one base URL
and one User API key.

- Base URL: `https://api.node.humain.com/v1` (OpenAI-compatible `/chat/completions`)
- Auth: `HUMAIN_NODE_API_KEY` (Bearer)
- Model catalog: fully live-discovered from `GET /models` on every catalog
  refresh. There is no bundled static model list and no default model,
  because availability is scoped per key/user/tier and HUMAIN Node does not
  publish per-model pricing. Pick a model with `openclaw models` once a key
  is configured.

## Setup

```bash
export HUMAIN_NODE_API_KEY=...   # from the Users page for your Team in HUMAIN Node
openclaw --humain-api-key "$HUMAIN_NODE_API_KEY"
openclaw models   # lists models this key can see, via live discovery
```

## Live test

`humain.live.test.ts` exercises a real round trip (list models, then run one
completion) when both a truthy live flag and a real key are present:

```bash
HUMAIN_NODE_API_KEY=... OPENCLAW_LIVE_TEST=1 pnpm test extensions/humain/humain.live.test.ts
```
