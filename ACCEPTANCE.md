# Acceptance Evidence

This file is intentionally incomplete until each command is run against the real target named below. No result in this file is a substitute for fresh command output.

## 1. Official Open Responses compliance suite

Pending: run the official CLI against the live server with all 10 core tests. WebSocket status: not attempted (stretch goal).

## 2. Direct server acceptance

Pending: run `npm run accept` against the live server using a real Cursor SDK run. This section will contain the eight required calls and the out-of-scope edit fault case.

## 3. Aperture kit

Provider configuration and task-zero finding: see `aperture/provider-entry.md`.

Awaiting owner: register the provider, then run `npm run accept` with
`APERTURE_BASE_URL` against Aperture and append the result plus matching
Aperture session-log evidence. Custom Open Responses item preservation remains
unverified until that run.
