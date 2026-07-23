# Cursor Open Responses Provider

An Open Responses HTTP server backed by the official `@cursor/sdk`. It exposes
`POST /v1/responses`, `POST /v1/responses/compact`, and MCP over streamable
HTTP at `/mcp`. It does not expose Chat Completions.

## Requirements

- Node 22.13 or newer. `GOAL.md` sets a Node 20+ project floor; current
  `@cursor/sdk` 1.0.24 raises the effective runtime floor to Node 22.13.
- `CURSOR_API_KEY`, held in the server environment only.
- `OPENRESPONSES_API_KEY` (or `CURSOR_OPENRESPONSES_API_KEY`) for callers.

## Run locally

```powershell
$env:CURSOR_API_KEY = '<Cursor user key>'
$env:OPENRESPONSES_API_KEY = '<server bearer token>'
npm run dev
```

Callers use `Authorization: Bearer <server bearer token>` or `X-API-Key`.
Never commit either value or an `.env` file.

`cursor:integrate_task` commits a baselined task only to `phase/<n>`.
`cursor:gate_phase` requires an `origin` remote and authenticated GitHub CLI on
the server host; it creates an ephemeral PR, waits for checks, closes a red
gate, and merges/deletes a green one. This local build checkout currently has
no remote, so that external path is not yet run.

Cursor-backed `cursor:plan`, `cursor:implement`, and `cursor:review` receipts
retain their full Cursor output in `docs/dispatch/episodes/` for later audit;
the implement and review summaries are capped in the receipt.

## Verification status

Unit tests and type checks cover the current HTTP core. The real-Cursor
acceptance run, the official Open Responses compliance suite, and several
hosted roles are not complete yet; see `PROGRESS.md` and `ACCEPTANCE.md` for
the authoritative state.

## Aperture

Use [the ready-to-paste provider entry](aperture/provider-entry.md) after a
tailnet owner has selected a real reachable server address and Cursor model.
The provider must enable `openai_responses`, and its `baseurl` must not include
`/v1`. The direct and Aperture acceptance evidence remains pending.
