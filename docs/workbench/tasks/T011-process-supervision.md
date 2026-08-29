# T011 — Process supervision and runtime events

Status: TODO

## Goal

Make Builder execution observable and recoverable enough for daily local use without pretending Forge can preserve control of a child process across a control-plane crash.

## Acceptance

- Record dispatch queued/started/session-bound/completed/failed/cancelled/interrupted milestones as durable runtime events.
- Successful Builder exit closes the Builder session and moves the task from construction into the review stage; it must never synthesize review PASS.
- Spawn failure marks the dispatch failed, session failed, task interrupted, and adapter error.
- Operator cancellation terminates the supervised child, records cancellation, and leaves the task interrupted.
- Normal control-plane shutdown attempts to terminate active supervised children.
- On service startup, dispatches left in starting/running state from a previous process are reconciled to interrupted/disconnected evidence; Forge must not claim they are still supervised.
- Terminal callbacks must be idempotent so cancel/exit races cannot overwrite an already-terminal result.

## Dependencies

- T010 OpenCode Builder adapter.

## Out of scope

- Crash-proof external process reattachment.
- Automatic retry.
- Automatic review or Git integration.
- Parallel integration.

## Validation

Tests cover success, spawn failure, cancellation, duplicate terminal callbacks and startup reconciliation. Smoke verifies a real child process can be launched, observed and durably completed through HTTP.
