# Cursor Responses Gateway Architecture

## Architecture thesis

The gateway converts an authenticated Cursor SDK agent run into a portable
Open Responses API. Aperture is the tailnet-only client ingress and injects
the gateway credential; the gateway retains the separate Cursor credential.
It is an agent runtime with a controlled repository checkout, not a general
public proxy or a Chat Completions adapter.

## Status legend

- **Current** — implemented or directly verified in this repository or its
  live integration.
- **Planned** — decided direction not yet deployed persistently.
- **Candidate** — plausible option that has not been selected.
- **Deferred** — intentionally not being built now.

## System shape

| Area | Status | Approach |
| --- | --- | --- |
| Responses gateway | Current | Node/TypeScript HTTP daemon exposing `/v1/responses`, `/v1/responses/compact`, `/v1/models`, and `/mcp`. |
| Cursor execution | Current | The daemon uses the official `@cursor/sdk`; it does not spawn or proxy the Cursor CLI. |
| Gateway authentication | Current | Every direct request needs `CURSOR_RESPONSES_API_KEY` as a bearer token or `X-API-Key`. |
| Cursor authentication | Current | `CURSOR_API_KEY` stays only in the daemon environment and backs the user’s Cursor subscription. |
| Aperture ingress | Current | A tailnet-only Tailscale Serve route and an `openai_responses` provider were verified end to end, then removed. |
| Persistent worker | Planned | Run one gateway process on a stable tailnet node with a dedicated checkout and a scoped Doppler service token. |
| Client integration | Planned | Aperture exposes the Responses route; Kilo Code is documented but not yet configured on this host. |
| Phase PR gate | Planned | The hosted gate can use `origin`; this PR adds the CI check it needs to observe. |

## Runtime model

The gateway process owns four things: the Cursor SDK client, the gateway
bearer-token check, in-memory response continuation, and one configured
repository checkout for hosted coding tools. `cursor:implement` is serialized
because the checkout is shared; read-only roles may run concurrently. The
daemon must therefore run where its checkout is intentional and recoverable.

The Windows workstation is suitable for short integration tests only. The
durable target is a dedicated, always-on tailnet worker with one checkout,
Node 22.13+, a service manager, and a Doppler service token scoped only to the
gateway’s runtime configuration. Do not run a durable worker against a
developer’s active working tree.

## Architectural invariants

- No API key or Doppler token is committed, rendered into a file, or returned
  to a client.
- Aperture is the normal client ingress. It injects the gateway credential;
  tailnet identity and Aperture grants authorize clients.
- The gateway remains Responses-shaped. It does not implement
  `/v1/chat/completions` merely for a client that expects that wire format.
- A Tailscale Serve route is tailnet-only. Do not use Funnel for this runtime.
- An Aperture configuration update starts from a fresh configuration plus its
  version hash, is validated, and changes only the intended provider.

## Related documents

- [Aperture operation workflow](docs/workflows/aperture.md)
- [ADR 0001: Aperture as the client ingress](docs/decisions/0001-aperture-ingress.md)
- [Aperture provider entry](aperture/provider-entry.md)
