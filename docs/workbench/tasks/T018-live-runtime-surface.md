# T018 — Live Runtime Surface

Status: TODO

Depends on: T016 PASS, T017 PASS.

## Goal

Turn Forge's Web/TUI surface from a mostly static project/status view into a compact live engineering console that clearly shows what is happening now across main threads, Builder threads and review/runtime activity.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/tui-interaction.md`
- `docs/workbench/tasks/T016-builder-thread-adapters.md`
- `docs/workbench/tasks/T017-compact-mira-web-ui.md`
- `server/dispatch-domain.mjs`
- `server/dispatch-manager.mjs`
- `src/App.tsx`

## Verified Context

- Forge already persists dispatches, sessions and runtime events.
- The UI must feel live without noisy animation or layout churn.
- Dynamic information should be compact and operational: who is working, on what, for how long, what changed, and what needs attention.
- Main thread UI remains available; Builder/review threads should be openable rather than represented only as anonymous log lines.
- Visible product UI is English-only.

## Scope

1. expose active main/Builder thread state and current task/provider in the primary control surface;
2. show session duration/started time and terminal state without requiring raw state inspection;
3. present recent dispatch/review/blocked/completed/failed events as a bounded live stream;
4. provide clear entry points to open the related thread/session from task/runtime rows;
5. distinguish actionable states (blocked, failed, review needed) from passive history;
6. update incrementally without resetting selection, focus or scroll unnecessarily;
7. keep runtime information durable across refresh/restart where Forge already has persisted evidence.

Prefer existing polling/runtime contracts unless a measured need justifies a different transport. Do not add WebSocket/SSE complexity merely for animation.

## Hard Constraints

- No fake progress indicators.
- Do not infer agent success from text output; use authoritative runtime/session/dispatch/review state.
- Do not let polling clear actionable errors or user selection.
- Do not create large decorative dashboards/charts.
- No auto-merge, auto-deploy or permission broadening.
- Do not overwrite provider-specific thread detail if it can be represented as optional metadata.

## Execution Entry Points

- `server/dispatch-domain.mjs`
- `server/dispatch-manager.mjs`
- `server/domain.mjs`
- `server/index.mjs`
- thread runtime/events introduced by T015/T016
- compact UI components/styles introduced by T017

## Acceptance

- While a real Builder runs, the UI identifies the active provider, task and session state and shows elapsed time or start time.
- Recent runtime changes appear without a full-page refresh and without losing selected project/task/thread.
- `blocked`, `failed`, `reviewing`, `completed` and active states are visually distinguishable in the compact Mira visual language.
- Selecting an active/completed runtime item can open or focus its related thread/session surface.
- Refresh/restart preserves durable history and reconstructs the current surface from authoritative state.
- A provider process completing successfully moves construction to `reviewing`; the UI does not call that review PASS.
- Error/attention states remain visible until a meaningful operator action or authoritative state change resolves them.
- Automated verification covers polling/update stability and core state-to-UI mapping; one real dispatch is used only for final observational smoke.
- `npm run check` remains green.

## Out of Scope

- Analytics dashboards and historical reporting.
- Parallel scheduling/worktree visualization.
- Automatic Reviewer loop if it is not already available.
- Fancy motion/animation.

## Unknown / Human Decision

None. If existing runtime events do not expose one required fact, add the smallest authoritative event/state field rather than deriving it from display text.

## Handoff

Build this on real runtime state, not mock visual behavior. Keep updates quiet, stable and information-dense.