# T008 — Dispatch readiness and dependency gate

Status: TODO

## Goal

Let Forge answer which tasks are safe to dispatch next without yet launching any Builder.

## Acceptance

- Compute readiness from task runtime state and `dependsOn` references.
- A task is ready only when all declared dependencies in the same batch are integrated or otherwise explicitly satisfied by policy.
- Reject missing/self/cyclic dependency definitions when a batch is created or validated.
- Do not dispatch tasks that already have an active Builder session.
- Expose a read-only readiness API suitable for a later scheduler/dispatcher.
- Parallel-ready tasks may be reported together, but integration remains serialized by policy.

## Dependencies

- T006 session lifecycle.

## Out of scope

- Starting agents.
- Choosing a model/provider.
- Auto-merge or deployment.

## Validation

Dependency graph tests + readiness API smoke + repository Verify.
