# T012 — TUI dispatch wiring

Status: REVIEW

## Goal

Expose the first real Builder dispatch in the keyboard-first Mira Forge control surface without replacing or restyling the current TUI direction.

## Acceptance

- Preserve the existing keyboard-first region model and visual direction.
- A selected ready task can explicitly dispatch to the local OpenCode Builder.
- Dispatch is state-changing and requires an explicit command/action plus form submit; navigation never dispatches implicitly.
- Runtime stream shows queued/started/session-bound/completed/failed/cancelled/interrupted evidence from Forge state.
- Active dispatch can be cancelled explicitly through a confirmation surface.
- API action errors remain visible across background polling without losing current project/task selection.
- Connection failures are tracked separately from action errors.
- Mouse support exists, while task selection / dispatch / cancel remain keyboard-reachable.
- The first-use UI reflects the serial Builder policy and displays which task currently owns `opencode-local`.

## Repository evidence

Implemented in `src/App.tsx` and `src/styles.css`. Task rows are focusable/selectable, `d` opens an explicit dispatch form, `x` opens cancel confirmation, the command palette exposes the same actions, and the runtime surface renders durable dispatch events. The UI checks authoritative dispatch readiness before opening the dispatch form and reflects the stricter single-active-Builder execution policy.

The backend dispatch/cancel paths, duplicate/serial gates, late callbacks and runtime evidence are automated in unit/smoke coverage. Users must not be asked to recreate those cases manually.

## Remaining acceptance

T012 is non-blocking for first use. Do **not** manufacture a disposable real project task merely to prove the UI.

The first normal project task the user actually dispatches through Forge is the observational acceptance: selection remains stable, the explicit Dispatch surface opens, runtime evidence appears, and the task lands in the expected terminal/review state. Explicit cancel can be accepted when naturally exercised; its process/state race contract is already automated.
