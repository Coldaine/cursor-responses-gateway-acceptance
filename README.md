# Cursor Responses Gateway

An Open Responses HTTP server backed by the official `@cursor/sdk`. It exposes
`POST /v1/responses`, `POST /v1/responses/compact`, and MCP over streamable
HTTP at `/mcp`. It does not expose Chat Completions.

## Requirements

- Node 22.13 or newer. `GOAL.md` sets a Node 20+ project floor; current
  `@cursor/sdk` 1.0.24 raises the effective runtime floor to Node 22.13.
- `CURSOR_API_KEY`, held in the server environment only.
- `CURSOR_RESPONSES_API_KEY` for callers. This is your gateway's own bearer
  token, not an Open Responses credential.

## Run locally

```powershell
$env:CURSOR_API_KEY = '<Cursor user key>'
$env:CURSOR_RESPONSES_API_KEY = '<gateway bearer token you choose>'
npm run dev
```

This checkout is scoped to Doppler project `ai-automation`, config `dev`, so
the configured local path can instead inject both values without placing them
in a file:

```powershell
doppler run -- npm run dev
```

Callers use `Authorization: Bearer <server bearer token>` or `X-API-Key`.
Never commit either value or an `.env` file.

`cursor:integrate_task` commits a baselined task only to `phase/<n>`.
`cursor:gate_phase` requires an authenticated GitHub CLI and the named PR
checks in `config/checks.yaml` on the server host. It creates an ephemeral PR,
waits for both `verify` and `Kilo Code Review`, closes a red gate, and
merges/deletes a green one. A queued Kilo review is not optional and keeps the
gate open; it must not be bypassed to make a phase look green. The repository
now has an `origin` and PR CI; the end-to-end hosted phase gate remains an
acceptance task.

Cursor-backed `cursor:plan`, `cursor:implement`, and `cursor:review` receipts
retain their full Cursor output in `docs/dispatch/episodes/` for later audit;
the implement and review summaries are capped in the receipt.
Ordinary Responses output is capped at 32,000 characters; its full Cursor
output is retained under `docs/dispatch/runtime/responses/` for the configured
workspace.

`config/model-routing.yaml` maps portable client-facing model IDs to current
Cursor model IDs. Set `allow_unlisted_models: false` once the live model list
has been verified to reject unknown models at the HTTP boundary.

## Verification status

Unit tests and type checks cover the current HTTP core. The real-Cursor
acceptance evidence, including the temporary Aperture route, is recorded in
`ACCEPTANCE.md`; the official Open Responses compliance suite remains blocked
by its external checker startup failure.

## Aperture

Use [the ready-to-paste provider entry](aperture/provider-entry.md) with the
[Aperture operating workflow](docs/workflows/aperture.md). The provider must
enable `openai_responses`, and its `baseurl` must not include `/v1`. A
temporary tailnet-only route was verified; no provider or gateway daemon is
left active after that test.
