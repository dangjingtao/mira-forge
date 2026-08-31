# T015 — Main Thread Runtime for Codex and OpenCode

Status: PASS

Depends on: T014 PASS.

## Goal

Add Forge's first real product entry: a durable main/dispatch thread that can run with Codex or OpenCode, understand the selected project, create/update repository Task Cards through the task-source contract, and hand an approved task to Forge dispatch.

The main thread is not a Builder. Its job is to discuss, inspect, plan, create Task Cards and decide when to dispatch.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/workbench/tasks/T014-repo-task-source-spike.md`
- `server/domain.mjs`
- `server/index.mjs`
- `server/opencode-adapter.mjs`
- `src/App.tsx`

## Verified Context

- Forge should remain usable through a persistent main thread UI; it is not only a background API for another agent product.
- Main/dispatch threads must support Codex and OpenCode.
- Codex Desktop and Codex CLI are separate transports and must not be mislabeled as one adapter.
- Repository Task Cards are project truth. Main threads may create or update them explicitly, but Forge must not invent a second task-management system.
- Existing durable session/dispatch/review state should be reused rather than replaced.

## Scope

Define and implement the smallest provider-neutral thread runtime needed for:

1. create/open a main thread for a registered project;
2. select `opencode`, `codex-desktop`, or `codex` as the main-thread adapter;
3. send user messages and receive durable normalized thread events;
4. let the main thread inspect project/task context through explicit Forge capabilities;
5. create/update a repository Task Card via T014's task-source boundary;
6. produce an explicit dispatch handoff referencing `project + taskId + taskRef + preferredBuilder`;
7. expose the thread in the Web/TUI surface well enough to continue the conversation.

The normalized event contract currently includes `message / thinking / tool / status / artifact / handoff`. Provider-specific details remain bounded and optional rather than forcing false uniformity.

## Hard Constraints

- Do not turn the main thread into a Builder process.
- Do not copy full Task Card truth into runtime state.
- Do not auto-dispatch merely because a Task Card was created; dispatch remains an explicit action/handoff.
- Do not auto-push, merge, deploy or broaden permissions.
- Do not require Codex/OpenCode feature parity beyond the minimal thread contract.
- Keep provider-specific behavior behind adapters.
- Do not scrape Codex Desktop UI or attach to an undocumented private stdio stream.

## Execution Entry Points

- `server/domain.mjs`
- `server/index.mjs`
- existing adapter/session modules
- new thread-domain/runtime modules and tests
- `src/App.tsx` or focused new thread UI components

## Acceptance

- A registered project can open a durable main thread using OpenCode or Codex.
- Codex can be supplied by the installed desktop product without requiring a separately installed standalone CLI; Codex CLI remains an optional fallback adapter.
- User message -> agent response works through the normalized thread contract for each supported adapter, with bounded provider-specific metadata.
- Thread history survives UI refresh/control-plane restart where the underlying provider contract permits durable replay.
- The main thread can create one repository Task Card through the T014 task source and read it back.
- A dispatch handoff references the repository Task Card rather than duplicating its body.
- No dispatch occurs without an explicit user/agent action.
- Thread events are testable without requiring a real provider in CI; real-provider acceptance is limited to a small machine-level check.
- `npm run check` remains green.

## Implementation

- `server/main-thread-domain.mjs` owns durable provider-neutral `threads` and normalized `threadEvents` (`message / thinking / tool / status / artifact / handoff`). Main threads are deliberately separate from Builder/Reviewer sessions.
- `server/main-thread-adapters.mjs` implements OpenCode and standalone Codex CLI. OpenCode is pinned to `plan`, enables provider thinking output, and uses a read-oriented `OPENCODE_PERMISSION`; Codex CLI uses `codex exec --json` with read-only sandboxing and non-interactive approval policy.
- `server/codex-desktop-adapter.mjs` implements Codex Desktop through the documented Codex `app-server` protocol. On macOS it auto-discovers the backend bundled in `/Applications/ChatGPT.app` or legacy `/Applications/Codex.app`, with `~/Applications` fallbacks and `MIRA_FORGE_CODEX_DESKTOP_BIN` override. It launches a short-lived bundled `app-server --listen stdio://`, performs `initialize` / `initialized`, then `thread/start` or exact-ID `thread/resume` plus `turn/start`.
- Codex Desktop turns are forced to `approvalPolicy: never` and read-only sandboxing at both thread and turn boundaries. `thread/start` / `thread/resume` use the provider's `read-only` sandbox mode spelling, while `turn/start` uses `{ type: 'readOnly' }`. Provider-reported file changes are contract violations.
- The desktop path intentionally uses the bundled backend and the user's normal Codex home/auth/session store. It does not require a separate `codex` executable on PATH and does not depend on attaching to the Desktop app's current private process.
- All Codex resume paths require the provider to report the exact requested thread ID.
- Provider-normalized thinking/tool events are persisted while a turn is still running; the Web surface polls faster during an active turn so execution progress becomes visible before the final response.
- `server/main-thread-manager.mjs` injects bounded registered-project/task-index context, reuses the T014 task-source module for inspect/resolve/create/update, and creates reference-only dispatch handoffs without launching a Builder.
- Schema-1 state adds `threads` and `threadEvents` as backward-compatible additive collections. A control-plane restart reconciles an in-flight main-thread turn to an explicit interrupted/error state.
- `server/index.mjs` exposes thread/message/task/handoff endpoints without changing the existing dispatch authority and registers OpenCode, Codex Desktop and Codex CLI main-thread adapters.
- `src/MainThreadPanel.tsx` exposes separate `OpenCode`, `Codex Desktop`, and `Codex CLI` choices. It uses a controlled composer, clears on send, restores the draft on request failure, supports `Ctrl+Enter`, and folds thinking/execution details after turn completion. The larger visual redesign remains T017.

## Repository Verification

- Focused pre-PR pure-Node checks: 13 tests passed for thread domain, provider boundaries and additive store compatibility.
- Verify #93 on PR #4 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` against head `b65d6785764e10f48944891adc746550091599bd`.
- Smoke-fix Verify #115 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` against head `f2e8663ca12c76338456c8be1dc1af5211bcf298`.
- Codex Desktop sandbox-mode fix Verify #139 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` against head `1bf3ffc03ef31d065660baf437c2c749eeecd4c3`.
- Repository tests cover live provider-progress persistence while a turn remains `running`, OpenCode/Codex reasoning normalization, bounded progress streaming without duplicate final events, fake-provider thread contracts, durable replay after reopening the state store, a real temporary Markdown Task Card create/read/update cycle through T014, absence of Task Card body content from Forge state, and no auto-dispatch on handoff.
- Codex Desktop tests cover current/legacy macOS bundle discovery, explicit binary override behavior, the distinct thread-level `read-only` and turn-level `readOnly` sandbox contracts, reasoning/tool normalization, initialize handshake, new thread creation, exact-ID resume and final response capture without a real provider in CI.

## Smoke Findings — 2026-08-31

The first real Web smoke found and closed several product/runtime issues:

1. `MainThreadPanel` called `event.currentTarget.reset()` after an awaited request. The event target was no longer safe to dereference and produced `Cannot read properties of null (reading 'reset')`. The composer is now controlled and no longer uses async form reset.
2. The input did not clear after send. It now clears immediately and restores the submitted text only if the request fails.
3. Provider thinking/tool events were only committed after the provider process exited. They are now persisted incrementally and rendered under a live `thinking / execution…` section; completed process sections collapse while remaining reopenable.
4. `Ctrl+Enter` now sends from the composer. Existing global Forge shortcuts ignore text-entry controls, so this does not consume the project/navigation hotkeys while typing.
5. The original Codex adapter was actually Codex CLI only. The UI now distinguishes `Codex Desktop` from `Codex CLI`, and Desktop has its own app-server adapter.
6. The first real Codex Desktop smoke exposed a protocol mismatch: `thread/start` / `thread/resume` require sandbox mode `read-only`, not `readOnly`. The adapter and regression tests were corrected before acceptance.

### OpenCode real-provider evidence

OpenCode machine smoke is accepted:

- first turn inspected the real project ledger and identified `T012 — TUI dispatch wiring`;
- the Forge Web UI was refreshed between turns;
- normalized history replayed after refresh;
- the second turn correctly continued the same context and returned the prior task ID/title;
- the thinking/execution section rendered and collapsed after completion.

### Codex Desktop real-provider evidence

Codex Desktop machine smoke is accepted:

- the installed desktop-bundled backend successfully initialized through the app-server path;
- the first turn inspected the real project and identified `T012 — TUI dispatch wiring`;
- a second turn continued the prior context and returned the same task ID/title;
- normalized process events rendered during the turn;
- the earlier sandbox enum mismatch was fixed and did not recur in the accepted run.

The user explicitly accepted T015 after this real-provider smoke. UI polish or visual/interaction issues discovered around the main-thread surface are not part of this acceptance closure and are deferred to T017 or later UI work.

## Acceptance Closure

T015 is `PASS` as of 2026-08-31.

The provider/runtime contract is accepted on the evidence above. OpenCode refresh replay was exercised directly. Codex Desktop exact-thread continuation is covered by repository tests and a real two-turn machine smoke; acceptance does not require additional UI-polish work. Codex CLI remains an optional distinct adapter and is not required for T015 closure.

## Out of Scope

- PiAgent as a main/dispatch thread provider for this phase.
- Reviewer automation loop.
- Parallel Builder scheduling/worktrees.
- Full provider-specific tool rendering fidelity.
- Large visual redesign; T017 owns that.
- UI scraping or unsupported process injection into Codex Desktop.

## Handoff

T016 and T017 are now unblocked. Keep provider-specific behavior behind adapters, preserve the normalized thread contract, and treat further main-thread UI changes as separate UI work unless they expose a new runtime contract defect.
