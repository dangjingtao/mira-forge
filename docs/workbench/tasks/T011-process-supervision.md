# T011 — Process supervision and runtime events

Status: PASS

## Goal

Make Builder execution observable and recoverable enough for daily local use without pretending Forge can preserve control of a child process across a control-plane crash.

## Acceptance

- Record dispatch queued/started/session-bound/completed/failed/cancelled/interrupted milestones as durable runtime events.
- Successful Builder exit closes the Builder session and moves the task into the review stage; it never synthesizes review PASS.
- Spawn failure marks dispatch failed, session failed, task interrupted, and adapter error.
- Operator cancellation terminates the supervised child, records cancellation, and leaves the task interrupted.
- Normal control-plane shutdown terminates active supervised children and clears adapter liveness to `offline`.
- On startup, dispatches left in starting/running state from a previous process are reconciled to interrupted/disconnected evidence; Forge does not claim they are still supervised.
- Terminal callbacks are idempotent so cancel/exit races cannot overwrite an already-terminal result.

## Dependencies

- T010 OpenCode Builder adapter implementation.

## Out of scope

- Crash-proof external process reattachment.
- Automatic retry.
- Automatic review or Git integration.
- Parallel integration.

## Evidence

`server/dispatch-manager.test.mjs` covers success, spawn failure, cancellation winning over a late exit callback, restart reconciliation, and normal shutdown cleanup. `dispatch-smoke.mjs` exercises a real child process through HTTP and verifies runtime events/session state. A focused self-review found and fixed stale `busy` adapter liveness on shutdown and unguarded cross-task concurrent use of the first Builder adapter. Verify #51 passed `test + typecheck + build + smoke` on `905f6c5767df`.
