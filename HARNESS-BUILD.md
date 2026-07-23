# Build: Cursor-Dispatch Harness for Claude Code

Build this. Work autonomously. Stop only if genuinely blocked by something this document does not answer.

## What it is

Claude Code, locked down so it cannot execute anything itself, driving all real work through **Cursor's official TypeScript SDK** (`@cursor/sdk`). Claude plans and verifies; Cursor agents read, search, and write code. The orchestrator never trusts an agent's word: it checks the real git diff and real test results.

Why: orchestration reasoning runs on the Claude subscription, execution runs on the Cursor subscription's included usage pool.

## Fixed decisions (do not deviate, do not redesign)

| Decision | Value |
|---|---|
| Executor | `@cursor/sdk` (npm), TypeScript. NOT the `cursor-agent` CLI, NOT a reverse-engineered proxy |
| Cursor auth | `CURSOR_API_KEY`, a **user** API key. Per Cursor's docs, SDK runs follow the same pricing and request pools as IDE runs, and a user key bills to that user's plan |
| Anthropic API | None. Zero `ANTHROPIC_API_KEY` code paths. The orchestrator is Claude Code only |
| Mocks | **None.** No fake executor, no fake `gh`. Acceptance is real SDK calls producing real diffs |
| Runtime | Node 20+, ESM, TypeScript. MCP server on `@modelcontextprotocol/sdk`, stdio, named `dispatch` |
| Isolation | **No git worktrees.** One shared working tree. Implementer dispatches are serialized: never two writers at once. Read-only dispatches may run in parallel |
| Parallelism | Cursor SDK allows one active run per agent (409 `agent_busy`); parallelism means multiple agent instances, used only for read-only roles |
| Pull requests | **No standing PRs, ever.** See the gate model below |

## Merge and gate model

Tasks do not open PRs. Tasks commit to a phase branch. Each **phase** is gated by one ephemeral PR that exists only to trigger CI and PR-review tooling, blocks until everything passes, then auto-merges to base and deletes itself. A failing gate returns the failing checks so the orchestrator fixes and re-gates; it never leaves a PR open for a human to babysit.

## Tools (the MCP server exposes exactly these)

Dispatch tools call Cursor via the SDK (`Agent.create({ apiKey, model, local: { cwd } })`, `agent.send(...)`, consume `run.stream()`):

| Tool | Role | Write access | Returns |
|---|---|---|---|
| `explore(query, paths?)` | Find code, map a subsystem, answer "where is X handled" | None | Capped findings + `hits[]` of file:line, full transcript to disk |
| `plan(taskId, briefPath)` | Turn a brief into an implementation plan | **Plans only.** The agent produces plan text; the wrapper writes the file. It cannot touch code | `{planPath, summary, openQuestions[]}` |
| `implement(taskId, planPath)` | Execute one approved plan | Repo, serialized | `{summary, measuredDiffstat, flags[]}` |
| `review(taskId)` | Judge the diff against plan and brief | None | `{verdict: pass\|fail, findings[]}` |

Deterministic tools, no LLM:

| Tool | Behavior |
|---|---|
| `write_brief(taskId, content)` | Writes to `docs/dispatch/briefs/` only |
| `approve_plan(planPath)` | Flips plan front-matter `draft` to `approved`, stores a sha256 of the plan body |
| `run_checks(suite?)` | Runs commands from `checks.yaml`; returns pass/fail plus output tail per check. Never throws on a check failing |
| `get_diff(taskId, mode)` | `git diff` against the task baseline, output capped |
| `integrate_task(taskId, phaseId)` | Commits the task's work onto `phase/<n>`. Does not touch base |
| `gate_phase(phaseId)` | Opens the ephemeral PR, polls checks, auto-merges and deletes on green; on red returns failing checks without merging and without leaving a PR open |

## Enforced rules (the wrapper enforces these; do not rely on prompting)

- `implement` refuses unless the plan's front-matter says `approved` and its stored hash matches a fresh hash of the plan body.
- After every `implement`, the wrapper measures `git diff` itself. That measurement, plus `run_checks`, is the source of truth. Anything the agent claims is advisory.
- Any edit under `docs/dispatch/**` is reverted and flagged.
- Only one `implement` run at a time.
- Every dispatch return is capped in size; full transcripts go to `docs/dispatch/episodes/`, and the tool returns a path.

## Claude Code lockdown (`target-repo-kit/`)

`.claude/settings.json`: deny `Edit, Write, MultiEdit, NotebookEdit, Bash, Task, WebSearch, WebFetch`; allow `mcp__dispatch__*`. Add a `PreToolUse` hook denying the same set as a backstop, and have `install.sh` print a launch alias repeating them via `--disallowedTools`. Note: permission denies block Claude's built-in tools but not bash subprocesses, which is why Bash is denied outright rather than allow-listed.

`CLAUDE.md` doctrine, install verbatim: *You are an orchestrator. You cannot edit files, run commands, browse the web, or spawn subagents. On a goal, write a task and phase breakdown into PROGRESS.md. Per task: write_brief, plan, read and critique the plan yourself, approve_plan, implement, then always run_checks and get_diff before believing anything, review if risky, integrate_task. When a phase's tasks are integrated, gate_phase. Keep your context small: read the capped returns, spot-check with Read, send explore in for anything larger.*

## Acceptance (real, no mocks)

Build a script `npm run accept` that runs against the **real** Cursor SDK, using the cheapest available model, in a scratch git repo:

1. `write_brief` a trivial task (add a function plus its test).
2. `plan`, verify the plan file exists with `status: draft`, and that no code changed.
3. `implement` before approval: must be refused.
4. `approve_plan`, then `implement`: a real Cursor agent writes real code.
5. `run_checks`: the new test actually passes.
6. `get_diff`: the measured diff contains the real change.
7. `integrate_task` onto `phase/1`, confirm base is untouched.
8. `gate_phase`: opens a PR, waits for checks, auto-merges to base, deletes the branch, leaves no open PR.

Then a negative case: instruct a dispatch to edit something out of scope, and confirm the wrapper reverts and flags it.

**The build is not done until `npm run accept` passes against real Cursor SDK calls and real git.** Plumbing tests that do not call Cursor prove nothing.

## Deliverables

`server/` (the MCP server), `target-repo-kit/` (lockdown files plus an idempotent `install.sh`), `config/` (`dispatch.config.yaml` for model-per-role, `checks.yaml`), `scripts/accept.ts`, `README.md` covering setup and how to run acceptance, and `PROGRESS.md`.

Look up current `@cursor/sdk` usage and current model ids from its own docs and types before coding; do not guess API shapes. `NORTH_STAR.md` is created as a stub only; do not author its contents.
