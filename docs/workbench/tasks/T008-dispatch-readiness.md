# T008 — Dispatch readiness and dependency gate

Status: PASS

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

## Evidence

Implemented in `server/readiness.mjs` and exposed through `GET /api/batches/:batchId/dispatch-ready`. Dependency graph tests cover missing/self/cyclic references, independent parallel-ready tasks, integrated dependency release, `fixing` readiness and active Builder-session blocking. API smoke verifies invalid batches are rejected before persistence and readiness remains read-only. GitHub Actions Verify #28 passed `test + typecheck + build + smoke` on commit `18b2223e26ea`.
