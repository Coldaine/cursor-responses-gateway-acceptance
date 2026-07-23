# Acceptance Evidence

This file is intentionally incomplete until each command is run against the real target named below. No result in this file is a substitute for fresh command output.

## 1. Official Open Responses compliance suite

Attempted on 2026-07-23 against the live service at
`http://127.0.0.1:8787/v1`, with the official runner checked out separately.
The runner did not reach the server: its current Bun/Zod-generated schema
failed during startup with `Invalid regular expression: numbers out of order
in {} quantifier` in `zod@4.4.3`. Therefore no core test result is claimed;
this is an external-checker startup blocker, not a passing compliance result.
WebSocket status: not attempted (stretch goal).

## 2. Direct server acceptance

Pending: run `npm run accept` against the live server using a real Cursor SDK run. This section will contain the eight required calls and the out-of-scope edit fault case.

### Direct Doppler SDK verification 2026-07-23

The official `@cursor/sdk` was run through Doppler injection of
`CURSOR_API_KEY` only. `Cursor.models.list` returned 32 models including
`default`; an `Agent.create` run with that model finished successfully after
15 streamed events and returned `doppler-sdk-agent-ok`. No secret value was
printed or written to disk.

## 3. Aperture kit

Provider configuration and task-zero finding: see `aperture/provider-entry.md`.

A temporary provider route is proven below. A durable provider plus a complete
`npm run accept` pass against `APERTURE_BASE_URL`, including matching
session-log evidence, remains pending. Custom Open Responses item preservation
is unverified until that complete run.

### Temporary Aperture route verification 2026-07-23

- Added a temporary `cursor-responses` provider with `openai_responses: true`,
  `openai_chat: false`, bearer override injection, and model `default`.
- `GET /v1/models` through Aperture exposed `default` with provider id
  `cursor-responses`.
- An unauthenticated-to-the-gateway `POST /v1/responses` through Aperture
  completed a real Cursor response with `aperture-route-ok.`.
- A streamed response through Aperture preserved `response.created`,
  `response.completed`, and terminal `[DONE]`.
- The gateway URL rejected the same request without Aperture’s injected bearer
  credential with HTTP 401.
- The provider, Tailscale Serve rule, and temporary gateway process were
  removed after verification. This is a successful route proof, not a durable
  deployment or the complete Aperture acceptance script.

### Acceptance attempt 2026-07-23T12:39:48.553Z

- PASS: 1. model resolution — passed
- PASS: 2. basic non-streaming response — passed
- PASS: 3. streaming response — passed
- PASS: 4. cursor:explore receipt — passed
- PASS: 5. brief, plan, approval, and implement lifecycle — passed
- PASS: 6. checks and measured diff — passed
- FAIL: 7. integration and phase gate — cursor:integrate_task: Command failed: git add -A -- . :(exclude)docs/dispatch/**
The following paths are ignored by one of your .gitignore files:
docs/dispatch
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"

- FAIL: fault. out-of-scope dispatch edit is reverted and flagged — cursor:implement: Cannot establish a task baseline while non-dispatch workspace changes are present
- PASS: 8. previous_response_id continuation — passed

### Acceptance attempt 2026-07-23T12:42:06.945Z

- PASS: 1. model resolution — passed
- PASS: 2. basic non-streaming response — passed
- PASS: 3. streaming response — passed
- PASS: 4. cursor:explore receipt — passed
- PASS: 5. brief, plan, approval, and implement lifecycle — passed
- PASS: 6. checks and measured diff — passed
- FAIL: 7. integration and phase gate — cursor:integrate_task: Command failed: git add -A -- :(exclude)docs/dispatch/**
The following paths are ignored by one of your .gitignore files:
docs/dispatch
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"

- FAIL: fault. out-of-scope dispatch edit is reverted and flagged — cursor:implement: Cannot establish a task baseline while non-dispatch workspace changes are present
- PASS: 8. previous_response_id continuation — passed

### Acceptance attempt 2026-07-23T12:44:30.046Z

- PASS: 1. model resolution — passed
- PASS: 2. basic non-streaming response — passed
- PASS: 3. streaming response — passed
- PASS: 4. cursor:explore receipt — passed
- PASS: 5. brief, plan, approval, and implement lifecycle — passed
- PASS: 6. checks and measured diff — passed
- FAIL: 7. integration and phase gate — cursor:gate_phase: gate_phase requires an origin remote
- FAIL: fault. out-of-scope dispatch edit is reverted and flagged — out-of-scope edit was not flagged
- PASS: 8. previous_response_id continuation — passed

### Remediated fault case 2026-07-23

After removing a contradictory model instruction, a real Cursor-backed
`cursor:implement` run was asked to write under `docs/dispatch/`. The server
returned `status=completed` with
`flags=["dispatch_directory_edit_reverted"]`,
`dispatch_edit_reverted=true`, and an empty measured diff. This confirms that
the server, rather than a prompt-only rule, detected and restored the
out-of-scope dispatch write. A fresh complete acceptance scratch repository is
still needed for a single all-current run; the current scratch already
integrated its task before its expected no-remote gate failure.

### Acceptance attempt 2026-07-23T14:50:02.386Z

- PASS: 1. model resolution — passed
- PASS: 2. basic non-streaming response — passed
- PASS: 3. streaming response — passed
- PASS: 4. cursor:explore receipt — passed
- FAIL: 5. brief, plan, approval, and implement lifecycle — implement receipt omitted measured diffstat
- PASS: 6. checks and measured diff — passed
- FAIL: 7. integration and phase gate — cursor:gate_phase: failed
- PASS: fault. out-of-scope dispatch edit is reverted and flagged — passed
- PASS: 8. previous_response_id continuation — passed
