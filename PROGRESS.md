# Progress

This file is required by `GOAL.md`. It records the current build boundary;
lasting architecture and operating procedures live in `architecture.md` and
`docs/workflows/aperture.md`.

## Verified

- `CURSOR_API_KEY` and `CURSOR_RESPONSES_API_KEY` are scoped in Doppler project
  `ai-automation`, config `dev`; neither is written to this repository.
- A real Doppler-injected official Cursor SDK run discovered 32 models and
  completed an agent run with `default`.
- A temporary Aperture provider completed model discovery, a real Responses
  call, and semantic SSE through the tailnet. It was removed with its temporary
  Tailscale Serve route afterward.
- This repository has an `origin` remote and pull-request CI. The explore tool
  falls back safely when `rg` is absent on a runtime host.

## Still required by the goal

- The external Open Responses compliance runner must complete its 10 core
  tests; its current Bun/Zod startup failure is recorded in `ACCEPTANCE.md`.
- A fresh full direct `npm run accept` run must cover all eight calls and the
  out-of-scope fault case in one clean scratch repository.
- A durable Aperture provider and worker deployment must be selected and then
  tested with the full acceptance script. The temporary route is proof of the
  integration pattern, not that deployment.
- The hosted `cursor:gate_phase` flow must be exercised against a real phase
  branch and its ephemeral GitHub PR.

## Durable decisions

- Cursor execution is through the official `@cursor/sdk`, not the Cursor CLI.
- Aperture is the normal client ingress and injects the gateway bearer key.
- The durable gateway runs on one dedicated tailnet worker and checkout; the
  Windows workstation remains a temporary integration node.
