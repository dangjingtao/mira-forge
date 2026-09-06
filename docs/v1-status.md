# Mira Forge V1 Status

> **Historical snapshot.** This document records the V1 acceptance state as of 2026-08-29 and is no longer the current product-status summary. For the current product model and capabilities through T018, see `docs/user-guide.zh-CN.md`; for authoritative task status, see `docs/workbench/00-work-ledger.md` and the latest Task Cards.

**Snapshot date:** 2026-08-29
**Branch:** `dev`
**HEAD:** `0fb8a6018c8c2728429ede8f86aba9a29f78931e` (`0fb8a60`)
**Remote:** `origin/dev` is in sync with the local branch.

## Executive Decision

V1 is **implementation-complete but not yet human-accepted as closed**.

The Forge Core contract, durable runtime state, first Builder dispatch path, process supervision, runtime events, and keyboard-first TUI are present on `dev`. Repository verification is green through Verify #63. V1 remains open only for the machine-local acceptance of the actual OpenCode installation and the first observational real-project TUI dispatch.

This is not a reason to move the unfinished work into V2. T010 and T012 are V1 capabilities with a small remaining acceptance gate.

## What V1 Includes

### Forge Core and persistence

- One local control service on `127.0.0.1:47831`.
- Durable state under `~/.mira-forge/state.json` by default.
- Atomic state writes and backward-compatible additive schema-1 collections.
- Project registry, Batch/Task runtime state, and derived Batch status.
- Managed project/task truth remains in the managed repository; Forge stores orchestration/runtime evidence only.

### Runtime contracts

- Provider-neutral Builder / Reviewer / Git adapter registry and heartbeat.
- Durable Builder / Reviewer sessions with explicit lifecycle transitions.
- SHA-bound review handoffs and durable review history.
- Review-pass invalidation when the task SHA changes.
- Dependency validation for missing, self, cyclic, and malformed references.
- Read-only dispatch readiness with integrated-dependency and active-Builder gates.

### First real dispatch path

- Durable `dispatches` and append-only runtime `events`.
- Explicit dispatch API and explicit cancellation API.
- Local OpenCode Builder runner using `opencode run --format json --dir <projectRoot>`.
- Optional model/agent selection without provider logic in Core.
- Defensive JSONL parsing and first observed OpenCode `sessionID` binding.
- Bounded stderr/result evidence.
- Process exit as authoritative completion/failure evidence.
- Spawn failure, cancellation, restart reconciliation, and normal shutdown supervision.
- First-use serial policy: one active dispatch per Builder adapter.
- Successful Builder execution moves the task to review; it never manufactures Review PASS.

### Keyboard-first TUI

- Web dashboard remains a client of the control plane.
- Project and task selection are keyboard reachable.
- Explicit `d` dispatch and `x` cancellation surfaces.
- Command palette equivalents and visible key bar.
- Runtime event history, Builder ownership/busy state, and persistent action errors.
- `a` First-run Check for machine-local OpenCode verification.
- No automatic Review dispatch, merge, push, deployment, or permission broadening.

## Verification Evidence

The current `dev` verification contract runs:

```text
npm test
npm run typecheck
npm run build
npm run smoke
```

The smoke suite covers the control-plane contract, readiness, fake-OpenCode process execution, dispatch/session evidence, cancellation, and the First-run Check path. Verify #63 is recorded as passing test, typecheck, build, and smoke coverage.

The repository cannot prove a user's local provider credentials or network/model availability. Those remain intentionally machine-local acceptance facts.

## Work Ledger

| Task | Status | Current meaning |
| --- | --- | --- |
| T001-T009 | PASS | Core, persistence, adapters, sessions, review, readiness, and durable dispatch contracts are verified. |
| T010 | REVIEW | OpenCode adapter implementation and fake-process path are verified; actual local `opencode` provider/configuration still needs one First-run Check. |
| T011 | PASS | Process supervision and runtime event lifecycle are verified. |
| T012 | REVIEW | TUI dispatch wiring is implemented and repository-verified; the first normal real-project dispatch remains observational acceptance. |
| T013 | PASS | One-step disposable First-run Check is implemented and verified through API/UI and fake-OpenCode coverage. |

`REVIEW` here means “implementation exists and one named acceptance fact remains”; it does not mean the feature should be redesigned or reimplemented in V2.

## Remaining V1 Acceptance

The remaining human workflow is intentionally small:

1. Start Forge with the normal local development command.
2. Open the First-run Check with `a` (or its visible trigger).
3. Submit once and require a `PASS` using the actual local `opencode` installation.
4. Confirm the check reports process/session/marker evidence and does not create a Project, Batch, or Task.
5. Dispatch the first real harmless project task through the TUI when such a task is naturally available.
6. Observe that selection survives polling, the explicit Dispatch surface is used, runtime events appear, and successful construction lands in review rather than PASS.

The cancellation race, internal IDs, API contracts, persistence, and failure/restart cases are already automated. They should not be recreated manually.

## V1 Close Criteria

V1 may be marked closed when:

- T010 First-run Check returns `PASS` on the target machine.
- T012 first real-project dispatch is observed successfully in the TUI.
- No unresolved runtime or data-integrity defect remains.
- The decision to merge `dev` into `main` is made separately from this acceptance.

Until then, the correct label is:

```text
V1 implementation complete
V1 human acceptance in progress
V2 not started
```

## V2 Boundary

V2 should add new capability rather than absorb unfinished V1 acceptance:

- Automatic Reviewer dispatch and a Reviewer adapter.
- Explicit Git integration and integration workflow.
- Scheduler, worktrees, and parallel Builder execution.
- Retry, resume, or external-process reattachment.
- Task-ledger ingestion/import surfaces.
- TUI search, filtering, command history, and broader operator workflows.
- Additional Builder/Reviewer providers.
- Mira Thread to Forge Run integration.

These remain out of V1 because they change orchestration scope, integration policy, or concurrency guarantees.

## Source References

- `docs/architecture.md` — Core boundaries and state model.
- `docs/workbench/00-work-ledger.md` — task-level status and evidence.
- `docs/workbench/02-third-wave.md` — first real dispatch wave.
- `docs/workbench/tasks/T010-opencode-builder.md` — OpenCode adapter acceptance.
- `docs/workbench/tasks/T012-tui-dispatch.md` — TUI dispatch acceptance.
- `docs/workbench/tasks/T013-first-run-check.md` — one-step machine-local check.
- `docs/tui-interaction.md` — keyboard and TUI interaction model.
- `docs/v2-plan.md` — new capability planning after V1 closure.
