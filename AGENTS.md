# Agent routing

Read [NORTH_STAR.md](NORTH_STAR.md) first; it is owner-written intent. Read
[architecture.md](architecture.md) for current versus planned technical truth.

| Task | Authority |
| --- | --- |
| Gateway runtime or API boundary | `architecture.md` |
| Aperture deployment, secrets, Kilo use | `docs/workflows/aperture.md` |
| Aperture ingress rationale | `docs/decisions/0001-aperture-ingress.md` |
| Acceptance evidence | `ACCEPTANCE.md` |

Run `npm test`, `npm run typecheck`, and `npm run build` before a reviewable
change. Keep secrets in Doppler, use explicit staging, and open a PR only for
a complete reviewable scope. Inspect that PR’s checks and review feedback
before calling the work complete.
