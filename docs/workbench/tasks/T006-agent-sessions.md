# T006 — Agent session lifecycle

Status: PASS

## Goal

Represent Builder and Reviewer execution sessions as durable runtime facts that survive UI/client disconnects and remain independent from any specific agent implementation.

## Acceptance

- Create/list/update sessions bound to an existing project, batch and task.
- Session roles are `builder` or `reviewer` and reference a compatible registered adapter.
- Enforce an explicit lifecycle and reject invalid transitions.
- Keep current Builder/Reviewer session pointers on the task while preserving session history.
- Reject a second active session for the same task/role unless the previous one is terminal.
- Session completion/failure/disconnect must not delete task state.
- Existing schema-1 state files without a `sessions` array remain readable.

## Dependencies

- T005 adapter registry — PASS.

## Out of scope

- Spawning agent processes.
- Injecting prompts/context into an agent.
- Terminal multiplexing.

## Evidence

Implemented in `server/domain.mjs`, `server/store.mjs` and `server/index.mjs`; transition tests and HTTP smoke cover compatible role binding, duplicate-active-session rejection, history retention and terminal lifecycle. GitHub Actions Verify #26 passed `test + typecheck + build + smoke` on commit `cd07e92ec9c9`.
