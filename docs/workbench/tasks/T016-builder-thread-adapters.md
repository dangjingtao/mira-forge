# T016 — Builder Thread Adapters for OpenCode, PiAgent and Codex

Status: REVIEW

Depends on: T015 PASS.

## Goal

Extend Forge's construction thread so one Builder contract can launch and supervise OpenCode, PiAgent or Codex without making Forge core depend on any one provider.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/workbench/tasks/T015-main-thread-runtime.md`
- `server/dispatch-manager.mjs`
- `server/opencode-adapter.mjs`
- `server/dispatch-domain.mjs`
- `server/domain.mjs`

## Verified Context

- OpenCode Builder dispatch already works through a supervised local process adapter.
- Forge owns dispatch/session/runtime evidence; provider-specific process/session behavior belongs behind adapters.
- Construction threads for this phase must support OpenCode, PiAgent and Codex.
- Parallel construction is still deferred until scheduler/worktree contracts exist; adapter count must not accidentally enable concurrent writes into one working tree.
- T015 established that Codex Desktop and standalone Codex CLI are distinct transports. T016 therefore does not force a separate CLI installation when the installed Desktop product already contains a usable Codex backend.

## Scope

1. extract or formalize the minimal Builder adapter contract from the working OpenCode path;
2. keep OpenCode behavior compatible with the existing verified dispatch path;
3. add PiAgent Builder support through its real local interface;
4. add Codex Builder support through its real local interface;
5. normalize start/session/event/cancel/terminal evidence sufficiently for Forge runtime and thread UI;
6. allow an explicit preferred Builder choice in dispatch handoff;
7. preserve serial first-use Builder safety unless a later scheduler contract explicitly replaces it.

Provider-specific event fields may remain optional. Do not force fake parity.

## Hard Constraints

- No permission-bypass flags.
- No auto-push, auto-merge or deploy.
- No worktree/parallel scheduler in this task.
- A successful Builder process/session completion still means `reviewing`, never `review_passed`.
- Cancellation must remain explicit and bounded.
- Core durable state must not require a provider executable to be alive.
- Do not rewrite the working OpenCode adapter merely for abstraction aesthetics; preserve its verified behavior.

## Execution Entry Points

- `server/builder-contract.mjs`
- `server/opencode-adapter.mjs`
- `server/piagent-adapter.mjs`
- `server/codex-builder-adapter.mjs`
- `server/dispatch-manager.mjs`
- `server/dispatch-domain.mjs`
- `server/domain.mjs`
- `scripts/builder-adapter-smoke.mjs`
- focused adapter/dispatch tests

## Implementation

- `server/builder-contract.mjs` defines the three product-level Builder choices (`opencode`, `piagent`, `codex`), preserves the existing `opencode-local` adapter ID, and maps PiAgent/Codex to provider-neutral durable adapter IDs. Existing explicit custom `adapterId` dispatch remains available; a named Builder choice cannot silently disagree with an explicit adapter ID.
- `server/opencode-adapter.mjs` remains the reference implementation and is intentionally not rewritten for abstraction aesthetics.
- `server/piagent-adapter.mjs` runs the installed `pi` executable in non-interactive JSON event mode with an ephemeral session. The Pi JSON session header supplies an observed provider session identity when present; tool lifecycle and terminal assistant text are normalized defensively. Malformed JSON lines are ignored.
- `server/codex-builder-adapter.mjs` reuses the Codex backend bundled with the installed macOS ChatGPT/Codex Desktop application by default. It does not require a separately installed PATH CLI. Builder execution uses `codex exec --json` with a `workspace-write` sandbox and approval policy `never`; no danger/bypass flag is used. An explicit binary override remains available for other supported machine layouts.
- `server/dispatch-manager.mjs` now accepts `builder` or `preferredBuilder` in addition to the legacy `adapterId`, auto-registers the three built-in Builder descriptors, persists bounded normalized provider evidence, accepts provider-reported external session/thread identity, and treats provider-reported errors as failure even if the child process exits zero.
- First-use serial safety is preserved globally across the three built-in choices. Adding PiAgent/Codex does not create three simultaneous write lanes into an unmanaged working tree. Parallel Builders remain blocked until a scheduler/worktree contract explicitly replaces this guard.
- Successful execution still moves the Task only to `reviewing`. Cancellation, restart reconciliation and shutdown remain owned by the existing Forge process-supervision path.
- `/api/meta` exposes the product-level Builder choices and built-in adapter IDs. Dispatch remains an explicit API/action; creating a main-thread handoff still does not launch a Builder automatically.

## Provider Interface Evidence

### PiAgent

Current Pi coding-agent documentation defines `--mode json` as a JSON-lines event stream and `-p/--print` as non-interactive execution. `--no-session` provides an ephemeral run while the JSON stream still begins with a session header containing an ID. The adapter consumes only the stable session/message/tool lifecycle needed by Forge and does not depend on cumulative token snapshots.

### Codex

T015 already verified the user's installed Codex Desktop bundled backend through its app-server transport. T016 reuses that same discovered executable for construction, but uses its non-interactive `exec` entry point rather than pretending the read-only main-thread app-server contract is a Builder contract. The approval option is emitted as a global Codex option before `exec`, while `workspace-write` remains the bounded construction sandbox.

## Deterministic Verification

Repository tests cover:

- all three explicit Builder choices through the same dispatch contract;
- built-in adapter registration and alias resolution;
- cross-provider serial dispatch safety;
- PiAgent/Codex argument construction without permission-bypass flags;
- malformed provider JSONL tolerance;
- process PID plus provider session/thread identity when observed;
- bounded normalized tool/provider runtime evidence;
- provider-reported failure with zero process exit;
- OpenCode regression behavior;
- cancellation/restart/shutdown supervision inherited from the existing manager.

`npm run check` is the acceptance gate. T016 stays `REVIEW` until the implementation PR passes repository Verify.

## Narrow Real-machine Smoke

Real-provider smoke does not require the user to recreate Forge batches, task IDs, sessions or internal API state. The helper creates a disposable Git repository, asks the selected Builder to write one marker file, verifies it, prints bounded evidence and removes the repository.

PiAgent:

```bash
node scripts/builder-adapter-smoke.mjs piagent
```

Codex Desktop bundled backend:

```bash
node scripts/builder-adapter-smoke.mjs codex
```

Optional machine-specific overrides:

```bash
MIRA_FORGE_PIAGENT_BIN=/path/to/pi node scripts/builder-adapter-smoke.mjs piagent
MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN=/path/to/codex node scripts/builder-adapter-smoke.mjs codex
```

These are observational machine checks, not CI prerequisites. CI exercises both adapters with deterministic fake runners/protocol fixtures.

## Acceptance

- The same ready Task Card can be dispatched with an explicit Builder choice of `opencode`, `piagent` or `codex`.
- Each adapter exposes observed external session/process identity when the provider makes it available.
- Each adapter produces normalized running/terminal evidence and supports explicit cancellation.
- Provider-specific malformed output does not crash the control plane.
- OpenCode regression tests remain green.
- CI can exercise each adapter through deterministic fake runners or protocol fixtures.
- At least one narrow real-machine smoke path is documented for PiAgent and Codex without asking the user to recreate internal API state.
- `npm run check` remains green.

## Out of Scope

- Provider feature parity beyond the minimal Builder contract.
- Main-thread PiAgent support.
- Automatic Reviewer dispatch.
- Parallel Builders/worktrees.
- Provider account/model configuration UI beyond a minimal explicit selector if required.

## Handoff

T016 implementation is ready for repository verification. If Verify passes, close T016 as PASS and leave real PiAgent/Codex machine smoke as the narrow observational confirmation path rather than blocking the adapter contract on user-created internal Forge state.
