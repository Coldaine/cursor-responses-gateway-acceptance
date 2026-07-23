# ADR 0001: Use Aperture as the client ingress

## Status

Accepted.

## Context

The gateway needs two credentials with different owners: `CURSOR_API_KEY` for
the daemon to execute Cursor runs, and `CURSOR_RESPONSES_API_KEY` for callers
of the gateway. Distributing the latter to every coding client would make
rotation and attribution harder. The gateway is reachable on the owner’s
tailnet, where Aperture already provides identity-aware routing.

## Decision

Clients use Aperture’s `/v1/responses` endpoint. Aperture stores and injects
`CURSOR_RESPONSES_API_KEY` with `authorization: bearer` and
`auth_mode: override`; the Cursor key never leaves the gateway runtime.
The provider enables `openai_responses` and disables `openai_chat` because the
gateway implements the Responses protocol only.

## Consequences

- Kilo Code and other Responses-capable clients need access to the tailnet,
  not a copy of the gateway bearer token.
- The provider base URL is the gateway origin. Aperture appends `/v1/...`, so
  including `/v1` in `baseurl` would double the path.
- A durable gateway needs a tailnet-reachable worker and a service lifecycle;
  the temporary workstation route is not a production deployment.
- Direct bearer access remains useful for local diagnostics but is not the
  normal client path.
