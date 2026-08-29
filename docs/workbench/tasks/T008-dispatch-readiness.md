# T008 — Dispatch readiness and dependency gate

Status: DOING

## Goal

Let Forge answer which tasks are safe to dispatch next without yet launching any Builder.

## Acceptance

- Validate task dependency references before an API-created batch is persisted.
- Reject missing, self and cyclic dependency definitions.
- Compute readiness from task runtime state and `dependsOn` references.
- A dependency is satisfied only when its task is `integrated`; policy overrides are not part of this milestone.
- `waiting` and `fixing` tasks may be dispatchable.
- Do not report a task ready when it already has an active Builder session.
- Expose a read-only readiness API that may report multiple independent tasks together.
- Readiness calculation must not launch an agent or mutate runtime state.
- Parallel-ready construction does not imply parallel integration.

## Dependencies

- T006 session lifecycle — PASS.

## Out of scope

- Starting agents.
- Choosing a model/provider.
- Policy overrides for dependency satisfaction.
- Auto-merge or deployment.

## Validation

Dependency graph tests + active-session gate tests + read-only readiness API smoke + repository Verify.
