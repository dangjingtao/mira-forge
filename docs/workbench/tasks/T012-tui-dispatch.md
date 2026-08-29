# T012 — TUI dispatch wiring

Status: REVIEW

## Goal

Expose the first real Builder dispatch in the keyboard-first Mira Forge control surface without replacing or restyling the current TUI direction.

## Unblocked baseline

The keyboard-first UI source is now present on remote `dev` at `3d744e301416` and was merged into `feat/dispatch-opencode` before T012 implementation. The task no longer relies on the stale pre-TUI dashboard source.

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

## Dependencies

- T009 — PASS.
- T010 — REVIEW pending real local OpenCode acceptance.
- T011 — PASS.
- Keyboard-first TUI source — available on `dev@3d744e301416`.

## Out of scope

- UI redesign.
- Automatic Reviewer dispatch.
- Parallel scheduler UI/worktree management.
- Requirement/task ingestion from a managed project's ledger.

## Repository evidence

Implemented in `src/App.tsx` and `src/styles.css` on `feat/dispatch-opencode`. Task rows are focusable/selectable, `d` opens an explicit dispatch form, `x` opens cancel confirmation, the command palette exposes the same actions, and the runtime surface renders durable dispatch events. The UI checks authoritative dispatch readiness before opening the dispatch form and reflects the stricter single-active-Builder execution policy.

Verify #57 passed `test + typecheck + build + smoke` after the TUI wiring and the action-error persistence fix.

## Remaining acceptance

Run one harmless task through the UI with the user's actual locally installed `opencode` binary and verify the live event sequence plus explicit cancel. Until that machine-level check is completed, T012 remains `REVIEW`.
