# T015 — Main Thread Runtime for Codex and OpenCode

Status: REVIEW

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
- Main/dispatch threads must support both Codex and OpenCode.
- Repository Task Cards are project truth. Main threads may create or update them explicitly, but Forge must not invent a second task-management system.
- Existing durable session/dispatch/review state should be reused rather than replaced.

## Scope

Define and implement the smallest provider-neutral thread runtime needed for:

1. create/open a main thread for a registered project;
2. select `codex` or `opencode` as the main-thread adapter;
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

## Execution Entry Points

- `server/domain.mjs`
- `server/index.mjs`
- existing adapter/session modules
- new thread-domain/runtime modules and tests
- `src/App.tsx` or focused new thread UI components

## Acceptance

- A registered project can open a durable main thread using either Codex or OpenCode.
- User message -> agent response works through the normalized thread contract for both adapters, with bounded provider-specific metadata.
- Thread history survives UI refresh/control-plane restart where the underlying provider contract permits durable replay.
- The main thread can create one repository Task Card through the T014 task source and read it back.
- A dispatch handoff references the repository Task Card rather than duplicating its body.
- No dispatch occurs without an explicit user/agent action.
- Thread events are testable without requiring a real provider in CI; real-provider acceptance is limited to a small machine-level check.
- `npm run check` remains green.

## Implementation

- `server/main-thread-domain.mjs` owns durable provider-neutral `threads` and normalized `threadEvents` (`message / thinking / tool / status / artifact / handoff`). Main threads are deliberately separate from Builder/Reviewer sessions.
- `server/main-thread-adapters.mjs` implements the minimum local CLI contract for OpenCode and Codex. OpenCode is pinned to `plan`, enables provider thinking output, and uses a read-oriented `OPENCODE_PERMISSION`; Codex uses `codex exec --json` with read-only sandboxing and non-interactive approval policy.
- Codex resume requires the provider to report the exact requested thread ID. Provider-reported file changes are treated as a contract violation instead of successful main-thread work.
- Provider-normalized thinking/tool events are now persisted while a turn is still running; the Web surface polls faster during an active turn so execution progress becomes visible before the final response.
- `server/main-thread-manager.mjs` injects bounded registered-project/task-index context, reuses the T014 task-source module for inspect/resolve/create/update, and creates reference-only dispatch handoffs without launching a Builder.
- Schema-1 state adds `threads` and `threadEvents` as backward-compatible additive collections. A control-plane restart reconciles an in-flight main-thread turn to an explicit interrupted/error state.
- `server/index.mjs` exposes thread/message/task/handoff endpoints without changing the existing dispatch authority.
- `src/MainThreadPanel.tsx` adds a compact persistent Web surface for project selection, OpenCode/Codex thread creation/continuation, conversation and durable event replay. It now uses a controlled composer, clears on send, restores the draft on request failure, supports `Ctrl+Enter`, and folds thinking/execution details after turn completion. The larger visual redesign remains T017.

## Repository Verification

- Focused pre-PR pure-Node checks: 13 tests passed for thread domain, provider boundaries and additive store compatibility.
- Verify #93 on PR #4 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` against head `b65d6785764e10f48944891adc746550091599bd`.
- Smoke-fix Verify #115 passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` against head `f2e8663ca12c76338456c8be1dc1af5211bcf298`.
- Repository tests now include live provider-progress persistence while a turn remains `running`, OpenCode/Codex reasoning normalization, bounded progress streaming without duplicate final events, both fake-provider thread contracts, durable replay after reopening the state store, a real temporary Markdown Task Card create/read/update cycle through T014, an assertion that Task Card body content is absent from Forge state, and an assertion that handoff creation leaves `dispatches` empty.

## Smoke Findings — 2026-08-31

The first real Web smoke found product-level issues before T015 could be marked PASS:

1. `MainThreadPanel` called `event.currentTarget.reset()` after an awaited request. The event target was no longer safe to dereference and produced `Cannot read properties of null (reading 'reset')`. The composer is now controlled and no longer uses async form reset.
2. The input did not clear after send. It now clears immediately and restores the submitted text only if the request fails.
3. Provider thinking/tool events were only committed after the provider process exited. They are now persisted incrementally and rendered under a live `thinking / execution…` section; completed process sections collapse while remaining reopenable.
4. `Ctrl+Enter` now sends from the composer. Existing global Forge shortcuts ignore text-entry controls, so this does not consume the project/navigation hotkeys while typing.
5. The current Codex adapter is explicitly **Codex CLI**, not the Codex/ChatGPT desktop client. The UI now labels it `Codex CLI` instead of implying that any installed Codex client is sufficient.

The smoke also demonstrated working OpenCode multi-turn context before the composer reset exception was raised. Refresh replay still needs one clean retest after these fixes.

## Remaining Machine-level Acceptance

T015 remains `REVIEW` for a narrow machine-level check:

1. retest one OpenCode main thread after the smoke fixes, including a Web refresh between turns, and confirm the same OpenCode session continues and normalized history replays;
2. run one Codex CLI two-turn smoke and confirm the second turn reports/resumes the same Codex thread ID.

The user's installed Codex desktop client does not satisfy item 2 by itself because this adapter currently spawns the `codex` executable. Supporting the desktop client's own app-server/session surface would be a separate provider adapter decision and must not be simulated by silently scraping or attaching to an undocumented private process.

This check is intentionally limited to provider/binary behavior that repository CI cannot authenticate or reproduce. It must not require recreating internal batches, hand-writing API calls, or exercising Builder dispatch.

## Out of Scope

- PiAgent as a main/dispatch thread provider for this phase.
- Reviewer automation loop.
- Parallel Builder scheduling/worktrees.
- Full provider-specific tool rendering fidelity.
- Large visual redesign; T017 owns that.

## Unknown / Human Decision

Codex has multiple local clients. T015's current proven automation path is the CLI contract. If Forge must integrate specifically with the desktop application's live sessions rather than a Forge-owned Codex CLI thread, define that as a separate adapter contract and validate a stable supported app-server transport before implementation.

## Handoff

Re-read current HEAD and provider interfaces before implementation. Keep the normalized contract small; optional provider features must not leak into Forge core.
