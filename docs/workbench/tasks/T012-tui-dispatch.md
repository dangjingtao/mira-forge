# T012 — TUI dispatch wiring

Status: BLOCKED

## Goal

Expose the first real Builder dispatch in the keyboard-first Mira Forge control surface without replacing or restyling the current TUI direction.

## Blocker

The current TUI shown in manual acceptance is newer than the `src/` code available on remote `dev`. Its interaction contract is committed in `docs/tui-interaction.md`, but the matching UI source is not yet available to this branch.

Because the source gap changes component structure, focus handling, shortcut routing and runtime-stream rendering, this task must not be implemented by guessing against the stale dashboard.

## Acceptance once unblocked

- Preserve the existing keyboard-first region model and visual direction.
- A selected ready task can explicitly dispatch to the local OpenCode Builder.
- Dispatch is state-changing and requires an explicit command/action; navigation never dispatches implicitly.
- Runtime stream shows queued/starting/running/completed/failed/cancelled/interrupted evidence from Forge state.
- Active dispatch can be cancelled explicitly.
- API errors remain visible without losing current project/task selection.
- Mouse support may exist, but dispatch workflow remains keyboard-reachable.
- The first-use UI reflects the serial Builder policy rather than presenting unsupported parallel execution.

## Dependencies

- T009 — PASS.
- T010 — REVIEW pending real local OpenCode acceptance.
- T011 — PASS.
- Current TUI source committed/pushed.

## Out of scope

- UI redesign.
- Automatic Reviewer dispatch.
- Parallel scheduler UI/worktree management.
