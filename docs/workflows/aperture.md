# Operating the gateway through Aperture

## Why this arrangement exists

`CURSOR_API_KEY` authorizes the daemon to run Cursor and is charged to that
Cursor account. `CURSOR_RESPONSES_API_KEY` authorizes an HTTP caller to this
gateway. Aperture holds the second key and injects it upstream, so Kilo and
other tailnet clients use identity-based access without receiving either
secret. Both secret names live in Doppler project `ai-automation`, config
`dev`; values must never be copied into this repository.

## Temporary integration procedure

Use this only for an integration test on a tailnet node, not as a durable
worker.

1. Build the gateway, set `CURSOR_MODEL=default` and
   `CURSOR_WORKSPACE_CWD` to the intended checkout, then run it through
   `doppler run -- npm run start` on port 8787.
2. Publish the localhost port inside the tailnet with
   `tailscale serve --bg 8787`. This yields the node’s HTTPS MagicDNS origin;
   do not enable Funnel.
3. Fetch the current Aperture configuration and version hash. Merge this
   provider, substituting only the in-memory Doppler value for `apikey`:

   ```json
   {
     "cursor-responses": {
       "name": "Cursor Responses Gateway",
       "baseurl": "https://<gateway-node>.<tailnet>.ts.net",
       "apikey": "<CURSOR_RESPONSES_API_KEY>",
       "authorization": "bearer",
       "auth_mode": "override",
       "models": ["default"],
       "compatibility": {
         "openai_chat": false,
         "openai_responses": true
       }
     }
   }
   ```

4. Validate the full merged configuration through
   `POST /aperture/config:validate`, then save it through `PUT /api/config`
   with the fresh hash. Never PUT an old or hand-copied configuration over
   other providers.
5. From a tailnet client, call Aperture’s `/v1/models` and
   `/v1/responses` without the gateway bearer token. Confirm the model is
   offered by `cursor-responses`, the response completes, and an SSE response
   contains `response.created`, `response.completed`, and `[DONE]`.
6. Remove only the `cursor-responses` provider from a fresh configuration,
   validate and save it, stop the exact daemon process, then run
   `tailscale serve reset`.

## Durable runtime recommendation

Deploy the daemon to a dedicated, always-on tailnet worker, not a developer
workstation. Give it one dedicated repository checkout, Node 22.13+, and a
service manager that runs `doppler run` with a Doppler service token scoped to
the gateway configuration. Keep the process bound to localhost and place
Tailscale Serve in front of it. Rotate `CURSOR_RESPONSES_API_KEY` in Doppler,
then update the Aperture provider; rotate `CURSOR_API_KEY` independently.

Before replacing or restarting a durable worker, drain active traffic, retain
the checkout and `docs/dispatch` audit material, then verify `/v1/models` and
a small Responses call through Aperture. Use Aperture logs for request and
identity observability; do not log credentials in the daemon.

## Kilo Code

Create a custom provider in Kilo Code with the **OpenAI Responses** API,
base URL `http://<aperture-hostname>/v1`, no API key, and the model discovered
from Aperture (currently `default` in the verified temporary path). Kilo’s
generic OpenAI Compatible mode targets Chat Completions and is not compatible
with this Responses-only gateway. Keep the Kilo configuration in its trusted
global configuration, not in a project file that can be opened by arbitrary
repositories.
