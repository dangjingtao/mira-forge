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
7. preserve serial first-use Builder safety unless a later scheduler contract explicitly replaces it;
8. expose the Builder choice and repository Task → runtime Batch path through the real Forge Web surface so human acceptance can be performed without reconstructing internal API state.

Provider-specific event fields may remain optional. Do not force fake parity.

## Hard Constraints

- No permission-bypass flags.
- No auto-push, auto-merge or deploy.
- No worktree/parallel scheduler in this task.
- A successful Builder process/session completion still means `reviewing`, never `review_passed`.
- Cancellation must remain explicit and bounded.
- Core durable state must not require a provider executable to be alive.
- Do not rewrite the working OpenCode adapter merely for abstraction aesthetics; preserve its verified behavior.
- Repository Task Cards remain the project truth; runtime Batch/Task state must not become a second Task Card source.

## Execution Entry Points

- `server/builder-contract.mjs`
- `server/opencode-adapter.mjs`
- `server/piagent-adapter.mjs`
- `server/codex-builder-adapter.mjs`
- `server/dispatch-manager.mjs`
- `server/dispatch-domain.mjs`
- `server/domain.mjs`
- `server/project-task-actions.mjs`
- `src/App.tsx`
- `src/t016-builder-ui.css`
- `scripts/builder-adapter-smoke.mjs`
- focused adapter/dispatch/task-source tests

## Implementation

- `server/builder-contract.mjs` defines the three product-level Builder choices (`opencode`, `piagent`, `codex`), preserves the existing `opencode-local` adapter ID, and maps PiAgent/Codex to provider-neutral durable adapter IDs. Existing explicit custom `adapterId` dispatch remains available; a named Builder choice cannot silently disagree with an explicit adapter ID.
- `server/opencode-adapter.mjs` remains the reference implementation and is intentionally not rewritten for abstraction aesthetics.
- `server/piagent-adapter.mjs` runs the installed `pi` executable in non-interactive JSON event mode with an ephemeral session. The Pi JSON session header supplies an observed provider session identity when present; tool lifecycle and terminal assistant text are normalized defensively. Malformed JSON lines are ignored.
- `server/codex-builder-adapter.mjs` reuses the Codex backend bundled with the installed macOS ChatGPT/Codex Desktop application by default. It does not require a separately installed PATH CLI. Builder execution uses `codex exec --json` with a `workspace-write` sandbox and approval policy `never`; no danger/bypass flag is used. An explicit binary override remains available for other supported machine layouts.
- `server/dispatch-manager.mjs` accepts `builder` or `preferredBuilder` in addition to the legacy `adapterId`, auto-registers the three built-in Builder descriptors, persists bounded normalized provider evidence, accepts provider-reported external session/thread identity, and treats provider-reported errors as failure even if the child process exits zero.
- First-use serial safety is preserved globally across the three built-in choices. Adding PiAgent/Codex does not create simultaneous write lanes into an unmanaged working tree. Parallel Builders remain blocked until a scheduler/worktree contract explicitly replaces this guard.
- Successful execution still moves the Task only to `reviewing`. Cancellation, restart reconciliation and shutdown remain owned by the existing Forge process-supervision path.
- `/api/meta` exposes the product-level Builder choices and built-in adapter IDs.
- PR #9 closes the Web product-surface gap. `src/App.tsx` reads the product-level Builder choices and presents `OpenCode`, `PiAgent`, and `Codex` in the real dispatch modal, then posts the `builder` contract rather than a hard-wired `opencode-local` adapter ID.
- PR #9 also exposes repository Task Source → runtime Batch creation in the Web UI. The server reuses T014's repository Markdown task source, validates task ledger/task directory configuration before persisting it, resolves the exact Task Card filename/ref, and creates runtime Batch entries without copying Task Card content into durable Forge state.
- The UI global serial guard treats any active Builder dispatch as the occupied construction lane, independent of provider.
- T016 UI additions follow the accepted T017 tokens: structural controls are neutral (`surface/panel/line/text`), semantic states retain semantic colors, and Mira orange is reserved for selection/focus/rare active emphasis.

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
- cancellation/restart/shutdown supervision inherited from the existing manager;
- repository task-source inspection and exact Task Card ref resolution;
- validated task-source configuration before persistence;
- repository Task selection → runtime Batch creation and duplicate active-task rejection.

Verify #157 passed on PR #6 with `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`. PR #9 added the real product-loop UI/task-source path and was squash-merged to `dev` at `7d332b5a07e27c63502d6cc17e4c9e40026e36d6` after final PR-head Verify #181 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.

## Human Product-loop Acceptance

T016 is still not accepted. The previous OpenCode-only UI blocker is merged; the remaining acceptance fact is machine-local and must be observed by a human on the user's Mac.

Required observed loop:

1. open Forge Web UI against the local control plane;
2. select the project and create a Batch from its repository Task Source using the Web UI;
3. select a real ready Task row;
4. open Dispatch and choose `PiAgent` or `Codex` as Builder;
5. dispatch from the UI without reconstructing internal IDs or calling the API manually;
6. observe a real provider process/session identity and live normalized runtime events in Forge;
7. verify the Builder actually performs the Task Card work in the selected project working tree;
8. verify terminal success moves the Forge Task to `reviewing`, not `review_passed`;
9. refresh/reopen Forge and confirm durable dispatch/evidence remains visible.

A failure in provider launch, path discovery, event normalization, task execution, state transition, or durable replay fails this human acceptance and keeps T016 in REVIEW.

## Narrow Real-machine Diagnostic

These commands remain useful for isolating provider installation/adapter problems, but do not close T016 by themselves:

```bash
node scripts/builder-adapter-smoke.mjs piagent
node scripts/builder-adapter-smoke.mjs codex
```

Optional machine-specific overrides:

```bash
MIRA_FORGE_PIAGENT_BIN=/path/to/pi node scripts/builder-adapter-smoke.mjs piagent
MIRA_FORGE_CODEX_DESKTOP_BUILDER_BIN=/path/to/codex node scripts/builder-adapter-smoke.mjs codex
```

## Acceptance

- The same ready Task Card can be dispatched from the real Forge product surface with an explicit Builder choice of `opencode`, `piagent` or `codex`.
- Repository Task Cards remain authoritative while the UI can create the runtime Batch required for execution without manual API reconstruction.
- Each adapter exposes observed external session/process identity when the provider makes it available.
- Each adapter produces normalized running/terminal evidence and supports explicit cancellation.
- Provider-specific malformed output does not crash the control plane.
- OpenCode regression tests remain green.
- CI can exercise each adapter through deterministic fake runners or protocol fixtures.
- The PiAgent/Codex real-machine diagnostic path is documented but is not counted as product-loop acceptance.
- At least one PiAgent or Codex human product-loop dispatch has actually completed through Forge UI on the user's machine and reached durable Task `reviewing` state after refresh.
- `npm run check` remains green.

## Out of Scope

- Provider feature parity beyond the minimal Builder contract.
- Main-thread PiAgent support.
- Automatic Reviewer dispatch.
- Parallel Builders/worktrees.
- Provider account/model configuration UI beyond the minimal Builder selector needed to exercise this task.

## Handoff

T016 remains REVIEW. The provider-neutral Builder implementation and the Web product-loop entry points from PR #9 are merged to `dev` and Verify #181 is green. The next action is one human Mac PiAgent or Codex dispatch through Forge; only that completed end-to-end observation may return T016 to PASS.
