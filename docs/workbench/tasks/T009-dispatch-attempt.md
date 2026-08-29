# T009 — Dispatch request and durable attempt

Status: PASS

## Goal

Turn a read-only ready task into one explicit, durable Builder dispatch attempt without introducing provider-specific behavior into core runtime state.

## Acceptance

- Add durable `dispatches` and runtime `events` state with schema-1 backward compatibility.
- A dispatch request is accepted only when the task is currently reported ready by the existing readiness contract.
- Dispatch creation binds project, batch, task, Builder adapter and Builder session in one serialized state mutation.
- Duplicate dispatch for the same task is blocked by active-session readiness.
- The first-use policy allows only one active dispatch per Builder adapter, preventing false liveness and working-tree contention before scheduler/worktree support.
- Store dispatch metadata and bounded execution evidence, but do not persist the full inline prompt.
- Expose runtime state through small explicit APIs.
- A dispatch request does not auto-merge, push, deploy, or broaden Builder permissions.

## Dependencies

- T005 Adapter registry — PASS.
- T006 Session lifecycle — PASS.
- T008 Dispatch readiness — PASS.

## Out of scope

- Automatic Reviewer handoff.
- Parallel scheduling policy/worktrees.
- TUI controls.

## Evidence

Implemented in `server/dispatch-domain.mjs` and `server/dispatch-manager.mjs`. Store compatibility covers additive `dispatches`/`events`. Manager tests cover durable creation, same-task duplicate protection and cross-task single-adapter serialization. HTTP dispatch smoke exercises durable dispatch creation and runtime-event visibility. GitHub Actions Verify #51 passed `test + typecheck + build + smoke` on `905f6c5767df`.
