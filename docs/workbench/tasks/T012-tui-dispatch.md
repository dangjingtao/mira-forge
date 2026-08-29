# T012 — TUI dispatch wiring

Status: BLOCKED

## Goal

Expose the first real Builder dispatch in the keyboard-first Mira Forge control surface without replacing or restyling the current TUI direction.

## Blocker

The current TUI shown in manual acceptance is newer than the `src/` code available on the remote `dev` branch. Its interaction contract is committed in `docs/tui-interaction.md`, but the matching UI source is not yet available to this branch.

Because the source gap can change component structure, focus handling, shortcut routing and runtime-stream rendering, this task must not be implemented by guessing against the old dashboard.

## Acceptance once unblocked

- Preserve the existing keyboard-first region model and visual direction.
- A selected ready task can explicitly dispatch to the local OpenCode Builder.
- Dispatch is a state-changing operation and therefore requires an explicit command/action; navigation must never dispatch implicitly.
- Runtime stream shows starting/running/completed/failed/interrupted evidence from Forge state.
- Active dispatch can be cancelled explicitly.
- API errors remain visible without losing current project/task selection.
- Mouse support may exist, but the dispatch workflow must be reachable from the keyboard contract.

## Dependencies

- T009–T011 PASS.
- Current TUI source committed/pushed.

## Out of scope

- UI redesign.
- Automatic Reviewer dispatch.
- Parallel scheduler UI.
