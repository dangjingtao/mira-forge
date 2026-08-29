# T009 — Dispatch request and durable attempt

Status: DOING

## Goal

Turn a read-only ready task into one explicit, durable Builder dispatch attempt without introducing provider-specific behavior into core runtime state.

## Acceptance

- Add durable `dispatches` and runtime `events` state with schema-1 backward compatibility.
- A dispatch request must be accepted only when the task is currently reported ready by the existing readiness contract.
- Dispatch creation must bind project, batch, task, Builder adapter and Builder session in one serialized state mutation.
- A second dispatch for the same task must not race past the active-session gate.
- Store dispatch metadata and execution evidence, but do not persist the full inline prompt.
- Expose runtime state through small explicit APIs.
- A dispatch request must not auto-merge, push, deploy, or broaden Builder permissions.

## Dependencies

- T005 Adapter registry — PASS.
- T006 Session lifecycle — PASS.
- T008 Dispatch readiness — PASS.

## Out of scope

- Spawning OpenCode or another process; that belongs to T010.
- Automatic Reviewer handoff.
- Parallel scheduling policy.
- TUI controls.

## Validation

Domain/store tests plus HTTP smoke must prove durable creation, active-session race protection, additive legacy-state compatibility, and runtime-event visibility.
