# T016 — Builder Thread Adapters for OpenCode, PiAgent and Codex

Status: PASS

Depends on: T015 PASS.

## Goal

Extend Forge's construction thread so one Builder contract can launch and supervise OpenCode, PiAgent or Codex without making Forge core depend on any one provider.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/task-source-contract.md`
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
- The 2026-09-01 T015 regression invalidated earlier selected-project task-source evidence because the `mira-mobile` project name was bound to the wrong local root. A successful provider run is therefore not valid product-loop evidence unless the selected project root, task source and resolved Task Card are all verified to belong to the intended repository.
- Main-thread and Batch task-source operations now share the same conventional default resolution through `withTaskSourceDefaults`; project-specific task-source paths still override those defaults.
- The 2026-09-02 human smoke exposed an additional compatibility bug: Forge's Task Card reader accepted only canonical `# ID — Title` + `Status:` syntax while the established Mobile cards use forms such as `# MOB-031：...` and `状态：**待实施**`. PR #15 added bounded read compatibility without changing canonical Forge writer output.

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
- Human acceptance evidence MUST bind to the intended registered project root and an exact resolved repository Task Card. Evidence produced from a wrong project root or unrelated ledger is invalid even when the Builder process itself succeeds.
- A human smoke may be read-only/check-oriented. Code modification is not itself an adapter acceptance requirement. If the selected smoke instruction permits writes, any writes must remain inside the exact verified working tree and task scope.

## Execution Entry Points

- `server/builder-contract.mjs`
- `server/opencode-adapter.mjs`
- `server/piagent-adapter.mjs`
- `server/codex-builder-adapter.mjs`
- `server/dispatch-manager.mjs`
- `server/dispatch-domain.mjs`
- `server/domain.mjs`
- `server/project-task-actions.mjs`
- `server/repo-task-source.mjs`
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
- Builder adapters capture terminal assistant output as bounded `resultText`; `dispatch-manager` persists that result on the terminal dispatch record. Surfacing that durable result back into Main Thread is intentionally assigned to T018 rather than being treated as an adapter failure.
- First-use serial safety is preserved globally across the three built-in choices. Adding PiAgent/Codex does not create simultaneous write lanes into an unmanaged working tree. Parallel Builders remain blocked until a scheduler/worktree contract explicitly replaces this guard.
- Successful execution still moves the Task only to `reviewing`. Cancellation, restart reconciliation and shutdown remain owned by the existing Forge process-supervision path.
- `/api/meta` exposes the product-level Builder choices and built-in adapter IDs.
- PR #9 closes the Web product-surface gap. `src/App.tsx` reads the product-level Builder choices and presents `OpenCode`, `PiAgent`, and `Codex` in the real dispatch modal, then posts the `builder` contract rather than a hard-wired `opencode-local` adapter ID.
- PR #9 also exposes repository Task Source → runtime Batch creation in the Web UI. The server reuses T014's repository Markdown task source, validates task ledger/task directory configuration before persisting it, resolves the exact Task Card filename/ref, and creates runtime Batch entries without copying Task Card content into durable Forge state.
- The UI global serial guard treats any active Builder dispatch as the occupied construction lane, independent of provider.
- T016 UI additions follow the accepted T017 tokens: structural controls are neutral (`surface/panel/line/text`), semantic states retain semantic colors, and Mira orange is reserved for selection/focus/rare active emphasis.
- After the T015 task-source regression fix, Batch and main-thread task-source paths both consume the same default-resolution helper. This removes one inconsistency, but it does not make an incorrectly registered `rootPath` safe; root identity must still be observed during human smoke.
- PR #15 keeps canonical Forge Task Card creation/writes unchanged while making reads compatible with bounded legacy heading/status forms used by established repositories. Exact Task ID identity and unique Task Card resolution remain mandatory.

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
- repository Task selection → runtime Batch creation and duplicate active-task rejection;
- Mobile-style legacy Task Card read compatibility plus explicit-update behavior without duplicate metadata lines.

Verify #157 passed on PR #6 with `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`. PR #9 added the real product-loop UI/task-source path and was squash-merged to `dev` at `7d332b5a07e27c63502d6cc17e4c9e40026e36d6` after final PR-head Verify #181 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.

The 2026-09-01 T015 regression repair also passed 90 tests, typecheck and build, with focused coverage proving that main-thread and Batch-style task-source consumption share conventional defaults. PR #15 then passed Verify #214 (`npm test`, typecheck, build and smoke) before merge, covering the real Mobile Task Card syntax discovered during T016 smoke.

## Human Product-loop Acceptance

Accepted on 2026-09-02 by human Mac smoke, with the Builder-result-to-Main-Thread presentation gap explicitly handed to T018.

### Root / Task Source preflight

The real product flow verified:

1. selected Forge project: `mira-mobile`;
2. Forge showed the intended Mobile checkout root rather than the old wrong Forge root;
3. `+ batch` loaded the canonical Mobile ledger with 34 `MOB-*` tasks;
4. the selected smoke task resolved to exactly one Task Card: `docs/task-cards/MOB-031-shiyan-confirmation-hierarchy.md`;
5. the Task Card contained concrete Goal/Acceptance content suitable for a real Builder invocation.

The first dispatch attempt exposed the Task Card syntax compatibility bug described above. After PR #15 was merged and the local Forge server restarted, the same Batch/Task resolved successfully without rebuilding the Batch.

### Observed loop

1. Forge Web UI was opened against the local control plane.
2. The root/task-source preflight above was completed.
3. Batch `T16 smoke · MOB-031` was created from the verified repository Task Source using the Web UI.
4. `MOB-031` was selected and its exact Task Card ref was shown in the Dispatch modal.
5. `Codex` was selected as Builder; no manual API/internal-ID reconstruction was used.
6. Forge launched a real Codex Builder process/session and bound a real external session identity.
7. Forge accumulated live normalized provider/runtime evidence; the completed smoke retained 79 runtime events.
8. The Builder invocation completed with `dispatch.completed`, process exit code `0`, and runtime Task state `reviewing` rather than `review_passed`.
9. Browser refresh preserved the Batch, Task, external session/runtime evidence and `reviewing` state.
10. Repository task truth was not silently promoted to `PASS` by the Builder exit.

The smoke was accepted as an adapter/product-loop verification rather than as proof that the selected Mobile implementation task itself was functionally complete. A smoke may inspect/check a real task without requiring a code change; future smoke instructions should make read-only intent explicit when implementation is not desired.

### Conditional follow-up moved to T018

The Codex Builder adapter captures terminal assistant output and Forge persists it as dispatch `resultText`, but the current product surface does not yet return that child-task conclusion into Main Thread as a readable handoff. The operator should not need to infer a Builder's conclusion from raw Runtime Stream events.

This is a runtime/control-surface integration concern, not evidence that the Builder adapter failed to execute or report. T018 now owns the contract: durable Builder final result → related Main Thread handoff, idempotent across refresh/restart and still bound to authoritative dispatch/task state.

## Narrow Real-machine Diagnostic

These commands remain useful for isolating provider installation/adapter problems, but do not replace the completed product-loop evidence above:

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

- The same verified ready Task Card can be dispatched from the real Forge product surface with an explicit Builder choice of `opencode`, `piagent` or `codex`.
- Repository Task Cards remain authoritative while the UI can create the runtime Batch required for execution without manual API reconstruction.
- Human smoke evidence is invalid unless the selected project root, loaded ledger and resolved Task Card all belong to the intended repository.
- The selected smoke Task resolves to exactly one real Task Card and has concrete acceptance conditions suitable for Builder verification.
- Each adapter exposes observed external session/process identity when the provider makes it available.
- Each adapter produces normalized running/terminal evidence and supports explicit cancellation.
- Provider-specific malformed output does not crash the control plane.
- OpenCode regression tests remain green.
- CI can exercise each adapter through deterministic fake runners or protocol fixtures.
- The PiAgent/Codex real-machine diagnostic path is documented but is not counted as product-loop acceptance.
- At least one PiAgent or Codex human product-loop dispatch has actually completed through Forge UI on the user's machine, remained bound to the intended project/task context, and reached durable runtime Task `reviewing` state after refresh. A read-only/check-oriented smoke is valid; code modification is not required solely to prove adapter execution.
- If a Builder performs writes during acceptance, those writes must stay within the intended working tree/task scope.
- Builder success does not silently promote repository task truth to `PASS`.
- `npm run check` remains green.

## Out of Scope

- Provider feature parity beyond the minimal Builder contract.
- Main-thread PiAgent support.
- Automatic Reviewer dispatch.
- Parallel Builders/worktrees.
- Provider account/model configuration UI beyond the minimal Builder selector needed to exercise this task.
- Presenting Builder final `resultText` back into Main Thread; this is now explicit T018 scope.

## Handoff

T016 is PASS after the 2026-09-02 human Codex product-loop smoke. The adapter contract, provider launch/session identity, real Forge UI dispatch, root-bound Task Card resolution, normalized runtime evidence, terminal `reviewing` transition and refresh durability are all observed. T018 owns the remaining product seam discovered during smoke: return each durable Builder final result to the related Main Thread as a readable child-task handoff while keeping Runtime Stream as the execution/audit surface.
