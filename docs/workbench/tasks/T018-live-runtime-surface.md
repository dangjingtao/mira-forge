# T018 — Live Runtime Surface

Status: REVIEW

Depends on: T016 PASS, T017 PASS.

## Goal

Turn Forge's Web/TUI surface from a mostly static project/status view into a compact live engineering console that clearly shows what is happening now across main threads, Builder threads and review/runtime activity.

The human-facing control loop must also close: when a Builder child task finishes, its durable final result must return to the related Main Thread as a readable handoff so the Main Thread can continue reasoning from the child-task outcome instead of forcing the operator to inspect raw runtime logs.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/tui-interaction.md`
- `docs/frontend-style-contract.md`
- `docs/workbench/tasks/T016-builder-thread-adapters.md`
- `docs/workbench/tasks/T017-compact-mira-web-ui.md`
- `server/dispatch-domain.mjs`
- `server/dispatch-manager.mjs`
- `server/main-thread-manager.mjs`
- `src/App.tsx`
- `src/MainThreadPanel.tsx`
- `src/workbench/RuntimePane.tsx`
- `src/workbench/live-runtime-model.js`

## Verified Context

- Forge already persists dispatches, sessions and runtime events.
- Builder adapters already capture bounded terminal assistant output as durable dispatch `resultText`; the T016 human smoke showed that this result is not yet surfaced back into Main Thread as the child-task conclusion.
- The UI must feel live without noisy animation or layout churn.
- Dynamic information should be compact and operational: who is working, on what, for how long, what changed, and what needs attention.
- Main thread UI remains available; Builder/review threads should be openable rather than represented only as anonymous log lines.
- Runtime Stream is the execution/audit surface; Main Thread is the operator-facing reasoning/control surface. Raw provider events must not substitute for a readable child-task handoff.
- Manual Builder dispatch and Main Thread conversation are separate execution contexts. Their results may be correlated by authoritative project/batch/task/dispatch/session identity, but Forge must not merge or infer conversation context merely because the same provider is used.
- Visible product UI is English-only.

## UI Focus Correction

Human visual review after the first live-runtime implementation found that the default workbench exposed too many durable layers simultaneously: Main Thread runtime rows, Builder runtime rows, Batch/Task state and Event Log were all permanently visible even when they represented the same underlying task/session relationship. The result was information-rich but relationship-poor and worked against the focused TUI interaction model established in T017.

The corrected hierarchy is:

- primary workbench = current project/task/batch context plus a truthful compact runtime summary;
- runtime inspector modal = full Builder/Reviewer runtime inventory and Main Thread runtime inventory, grouped by execution role instead of mixed into one flat list;
- selected runtime detail = session/result/error evidence for the focused runtime row;
- event-log modal = raw bounded project event history, available on demand rather than permanently occupying the workbench;
- Main Thread rail = actual conversation surface; runtime inventory may focus a related Main Thread but must not duplicate the whole Main Thread inventory on the default workbench.

The primary runtime summary must retain active/attention counts so unresolved operational state is still visible even when detailed lists are moved behind an inspector. This is focus layering, not hiding runtime truth.

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
10. preserve the distinction between runtime truth and conversation text: Builder `resultText` may explain the outcome, but dispatch/session/task state remains authoritative for success/failure/review status;
11. keep the default workbench focused by summarizing runtime attention in one keyboard-focusable row and move full runtime inventory/event history into explicit inspector/modal surfaces;
12. show authoritative task/batch relation inside runtime inspection so a Builder runtime row is visibly tied to the same Task Card shown in the workbench rather than appearing as a duplicate unrelated object.

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
- Do not remove active/attention truth from the primary surface merely because full runtime rows move into a modal.
- Do not reintroduce task/fix CSS layers; runtime summary styles belong to canonical `workbench.css`, inspector/modal styles to canonical `overlays.css`.

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
- `src/workbench/RuntimePane.tsx`
- `src/workbench/RuntimeControl.tsx`
- `src/workbench/RuntimeInspectorModal.tsx`
- `src/workbench/RuntimeEventLogModal.tsx`
- `src/workbench/live-runtime-model.js`

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
- The default workbench no longer permanently stacks full runtime inventory plus Event Log above/below Batch state; it keeps a compact runtime summary with active/attention counts and opens detailed runtime/event data on demand.
- Runtime Inspector groups Builder/Reviewer task runtime separately from Main Threads and exposes authoritative Batch/Task identity so corresponding objects are understandable without guessing.
- Enter/click can open the focused runtime summary/rows, Escape closes the inspector/event modal, and the event-log shortcut is visible inside runtime inspection.
- Main Thread rows selected from runtime inspection focus the actual Main Thread rail instead of creating another duplicate conversation surface.
- Automated verification covers polling/update stability, core state-to-UI mapping, Builder-result handoff idempotency and task/dispatch correlation; one real dispatch is used only for final observational smoke.
- `npm run check` remains green.

## Delivery Evidence

- Initial implementation merged to `dev` through PR `#24` at squash commit `fa385d031e038d1d600cce532a14a53c2e0547ed`.
- Self-acceptance on 2026-09-02 found four implementation gaps in the merged tree rather than treating the initial green CI as sufficient acceptance: Builder result events were not injected into the next Main Thread provider turn, a result arriving during an active Main Thread turn could be folded into the collapsible process section, `starting` sessions could display creation time as a false start duration, and historical attention could remain actionable or be truncated after later authoritative resolution.
- Self-acceptance fixes merged through PR `#25` at squash commit `7f2ae600b8c9b4caa5ef8b2038714d413b422f4e`.
- Builder dispatches may explicitly bind a `sourceThreadId` only when the selected Main Thread belongs to the same project. Blank/default dispatch remains independent and receives no Main Thread conversation history.
- Terminal Builder states (`completed`, `failed`, `cancelled`, restart/shutdown interruption) write one durable `builder_result` handoff to the explicitly related Main Thread with authoritative project/batch/task/dispatch/session identity, provider/session metadata, terminal task state, bounded `resultText` and error evidence where available.
- Handoff append is idempotent by related Main Thread plus dispatch identity, so polling or restart reconstruction cannot append the same child result repeatedly.
- The next Main Thread user turn receives Builder result handoffs that arrived since the previous user turn as bounded Forge context. This makes the Main Thread model itself able to reason from the child result while explicitly treating dispatch/session/task state as authoritative and without injecting Builder conversation history. The same result is not re-injected on every later user turn.
- `builder_result` events remain standalone in the Main Thread timeline even if they arrive while another Main Thread turn is running, so the child-task result is not hidden inside the turn's folded thinking/execution process.
- Successful Builder completion still moves the task only to `reviewing`; the Main Thread result card displays dispatch state and task state separately and never promotes process success to Review PASS.
- The workbench composes a dedicated live-runtime projection from persisted Main Threads, Builder/Reviewer sessions, blocked dependency states and review-needed states without manufacturing progress.
- Runtime rows use authoritative `session.startedAt` for elapsed duration. A session that has not actually started does not manufacture elapsed execution time from `createdAt`.
- Historical failed/review attempts stop counting as actionable attention after current task truth moves beyond the unresolved state; unresolved active/attention rows are not discarded by the passive history cap.
- Builder runtime linked to a Main Thread provides an explicit focus entry point, while task-runtime selection preserves the existing task selection path and can reveal durable session/result/error detail.
- Main Thread renders terminal Builder handoffs as readable result cards while preserving the original T015 reference-only handoff shape.
- Existing two-second `/api/state` polling remains the runtime transport; no SSE/WebSocket, new permissions, auto-merge or conversation-context injection was introduced.
- Automated regression coverage includes state-to-live-UI mapping, duration semantics, project isolation, result-handoff identity/idempotency, cross-project binding rejection, terminal completion correlation, restart interruption handoff, provider-context result delivery-once, late-result delivery, resolved attention, unresolved-attention retention and stable polling row identity.
- PR `#24` final Verify run `33597035459` passed `npm test`, `npm run typecheck`, `npm run build` and `npm run smoke`.
- PR `#25` Verify run `33611537231` passed the same four gates, and merged-tree Verify run `33611610144` passed them again on `dev`.
- 2026-09-02 human UI review requested a focus-layer correction: keep runtime attention visible on the workbench, move full runtime inventory and raw Event Log behind keyboard-accessible inspector/modal surfaces, group Builder/Reviewer runtime separately from Main Threads, and make authoritative Batch/Task relationships explicit. This correction is implemented on `task/T018-focused-runtime-modals` pending verification/merge.
- Final acceptance remains intentionally in `REVIEW` until one real Builder dispatch is observed through the product UI/runtime and confirms the live summary/inspector, truthful timing, terminal Main Thread result handoff and next-turn Main Thread continuation on the actual local provider path.

## Out of Scope

- Analytics dashboards and historical reporting.
- Parallel scheduling/worktree visualization.
- Automatic Reviewer loop if it is not already available.
- Fancy motion/animation.
- Automatic semantic merging of Main Thread conversation context into an independently selected Builder Task Card.

## Unknown / Human Decision

None. If existing runtime events do not expose one required fact, add the smallest authoritative event/state field rather than deriving it from display text.

## Handoff

Build this on real runtime state, not mock visual behavior. Keep updates quiet, stable and information-dense. T016's human smoke established the missing product seam: Builder execution/result capture works, but the terminal child-task conclusion must now flow back into Main Thread without collapsing Main Thread and Builder contexts into one conversation. The primary TUI should stay focused: current work remains visible; secondary runtime inventory and raw events are recalled through explicit inspector surfaces rather than permanently occupying the workbench.
