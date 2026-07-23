# Aperture provider entry

Replace the placeholders before an Aperture owner saves this provider. Keep
`baseurl` at the server origin: Aperture appends incoming paths such as
`/v1/responses`, so including `/v1` here would produce a doubled path.

```json
{
  "providers": {
    "cursor-responses": {
      "name": "Cursor Responses Gateway",
      "description": "Cursor SDK-backed Open Responses server",
      "baseurl": "http://<tailnet-hostname-or-ip>:8787",
      "apikey": "<CURSOR_RESPONSES_API_KEY>",
      "authorization": "bearer",
      "auth_mode": "override",
      "models": ["<CURSOR_MODEL_ID>"],
      "compatibility": {
        "openai_chat": false,
        "openai_responses": true
      }
    }
  }
}
```

`auth_mode: "override"` tells Aperture to inject the configured provider key;
callers authenticate to Aperture through tailnet identity rather than receiving
that key. Do not commit a substituted provider key.

## Operation

Follow [the Aperture workflow](../docs/workflows/aperture.md) to create,
validate, test, and remove or persist this provider safely. A temporary
provider using this shape has already completed a real Cursor response and SSE
call through Aperture; it was intentionally removed after the test.

## Compatibility finding (task zero)

Tailscale's provider compatibility reference, last validated July 20, 2026,
lists self-hosted providers with `openai_chat` enabled by default and permits
`openai_responses`. Enabling `openai_responses` makes Aperture expose
`/v1/responses`; the self-hosted base URL must not include `/v1` because
Aperture appends the full incoming request path.

The reference does **not** promise preservation of Open Responses custom item
types or provider extension fields. The required Aperture acceptance run must
therefore verify the response receipts and SSE payloads unchanged. Until that
owner-gated run is recorded, custom-item passthrough is unverified.
