# T018 — Live Runtime Surface

Status: TODO

Depends on: T016 PASS, T017 PASS.

## Goal

Turn Forge's Web/TUI surface from a mostly static project/status view into a compact live engineering console that clearly shows what is happening now across main threads, Builder threads and review/runtime activity.

The human-facing control loop must also close: when a Builder child task finishes, its durable final result must return to the related Main Thread as a readable handoff so the Main Thread can continue reasoning from the child-task outcome instead of forcing the operator to inspect raw runtime logs.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/tui-interaction.md`
- `docs/workbench/tasks/T016-builder-thread-adapters.md`
- `docs/workbench/tasks/T017-compact-mira-web-ui.md`
- `server/dispatch-domain.mjs`
- `server/dispatch-manager.mjs`
- `server/main-thread-manager.mjs`
- `src/App.tsx`
- `src/MainThreadPanel.tsx`

## Verified Context

- Forge already persists dispatches, sessions and runtime events.
- Builder adapters already capture bounded terminal assistant output as durable dispatch `resultText`; the T016 human smoke showed that this result is not yet surfaced back into Main Thread as the child-task conclusion.
- The UI must feel live without noisy animation or layout churn.
- Dynamic information should be compact and operational: who is working, on what, for how long, what changed, and what needs attention.
- Main thread UI remains available; Builder/review threads should be openable rather than represented only as anonymous log lines.
- Runtime Stream is the execution/audit surface; Main Thread is the operator-facing reasoning/control surface. Raw provider events must not substitute for a readable child-task handoff.
- Manual Builder dispatch and Main Thread conversation are separate execution contexts. Their results may be correlated by authoritative project/batch/task/dispatch/session identity, but Forge must not merge or infer conversation context merely because the same provider is used.
- Visible product UI is English-only.

## Scope

1. expose active main/Builder thread state and current task/provider in the primary control surface;
2. show session duration/started time and terminal state without requiring raw state inspection;
3. present recent dispatch/review/blocked/completed/failed events as a bounded live stream;
4. provide clear entry points to open the related thread/session from task/runtime rows;
5. distinguish actionable states (blocked, failed, review needed) from passive history;
6. update incrementally without resetting selection, focus or scroll unnecessarily;
7. keep runtime information durable across refresh/restart where Forge already has persisted evidence;
8. when a Builder dispatch reaches a terminal state, surface its durable final result into the related Main Thread as a readable child-task handoff bound to the authoritative project/batch/task/dispatch identity;
9. make the handoff concise and human-oriented (task, provider, completion state, result/validation/risks when available) rather than replaying the full provider event stream;
10. preserve the distinction between runtime truth and conversation text: Builder `resultText` may explain the outcome, but dispatch/session/task state remains authoritative for success/failure/review status.

Prefer existing polling/runtime contracts unless a measured need justifies a different transport. Do not add WebSocket/SSE complexity merely for animation.

## Hard Constraints

- No fake progress indicators.
- Do not infer agent success from text output; use authoritative runtime/session/dispatch/review state.
- Do not let polling clear actionable errors or user selection.
- Do not create large decorative dashboards/charts.
- No auto-merge, auto-deploy or permission broadening.
- Do not overwrite provider-specific thread detail if it can be represented as optional metadata.
- Do not inject arbitrary Main Thread conversation history into a manually dispatched Builder. A Builder remains bound to its explicit dispatch/task context unless a later versioned contract says otherwise.
- Do not duplicate the same terminal Builder result into Main Thread on every poll/refresh; handoff delivery must be durable/idempotent.

## Execution Entry Points

- `server/dispatch-domain.mjs`
- `server/dispatch-manager.mjs`
- `server/domain.mjs`
- `server/index.mjs`
- `server/main-thread-domain.mjs`
- `server/main-thread-manager.mjs`
- thread runtime/events introduced by T015/T016
- compact UI components/styles introduced by T017
- `src/App.tsx`
- `src/MainThreadPanel.tsx`

## Acceptance

- While a real Builder runs, the UI identifies the active provider, task and session state and shows elapsed time or start time.
- Recent runtime changes appear without a full-page refresh and without losing selected project/task/thread.
- `blocked`, `failed`, `reviewing`, `completed` and active states are visually distinguishable in the compact Mira visual language.
- Selecting an active/completed runtime item can open or focus its related thread/session surface.
- Refresh/restart preserves durable history and reconstructs the current surface from authoritative state.
- A provider process completing successfully moves construction to `reviewing`; the UI does not call that review PASS.
- When a Builder finishes, the related Main Thread receives a readable completion handoff containing the child task identity and the durable Builder final result when available.
- The Main Thread handoff does not claim success from prose alone; terminal dispatch/session/task state remains authoritative and is reflected alongside the result.
- The same completed dispatch is handed off at most once logically; refresh/restart may reconstruct the visible handoff but must not append duplicate child-result messages.
- A manual Builder dispatch remains scoped to its selected Task Card and is not silently continued from unrelated Main Thread conversation context.
- Error/attention states remain visible until a meaningful operator action or authoritative state change resolves them.
- Automated verification covers polling/update stability, core state-to-UI mapping, Builder-result handoff idempotency and task/dispatch correlation; one real dispatch is used only for final observational smoke.
- `npm run check` remains green.

## Out of Scope

- Analytics dashboards and historical reporting.
- Parallel scheduling/worktree visualization.
- Automatic Reviewer loop if it is not already available.
- Fancy motion/animation.
- Automatic semantic merging of Main Thread conversation context into an independently selected Builder Task Card.

## Unknown / Human Decision

None. If existing runtime events do not expose one required fact, add the smallest authoritative event/state field rather than deriving it from display text.

## Handoff

Build this on real runtime state, not mock visual behavior. Keep updates quiet, stable and information-dense. T016's human smoke established the missing product seam: Builder execution/result capture works, but the terminal child-task conclusion must now flow back into Main Thread without collapsing Main Thread and Builder contexts into one conversation.
