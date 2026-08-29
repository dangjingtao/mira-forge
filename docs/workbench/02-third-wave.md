# Mira Forge Third Wave — First Real Dispatch

Status: READY FOR MANUAL ACCEPTANCE on `feat/dispatch-opencode`

Goal: make Forge useful for its first real construction run without expanding into automatic review, merge, deployment, or parallel integration.

Current status:

1. T009 Dispatch request and durable attempt — PASS
2. T010 OpenCode local Builder adapter — REVIEW (real local `opencode` binary acceptance pending)
3. T011 Process supervision and runtime events — PASS
4. T012 TUI dispatch wiring — REVIEW (repository verification passed; real local UI dispatch/cancel acceptance pending)

Verify #57 passes tests, typecheck, build, the original control-plane/readiness smoke, and the fake-OpenCode dispatch smoke on the TUI-wired branch.

## First-use policy

The first usable Builder path is intentionally serial: one Builder adapter may supervise only one active dispatch at a time. This avoids false liveness and working-tree contention before worktree/scheduler contracts exist.

The keyboard-first TUI now exposes task selection, `d` dispatch, `x` cancel, command-palette equivalents, Builder busy state, and durable runtime-event history. Dispatch still requires an explicit task-card reference and a submit action; task navigation never starts a Builder.

## Boundary

The control plane owns dispatch/session/runtime evidence. OpenCode remains an adapter implementation. Forge does not pass permission-bypass flags, auto-push, auto-merge, deploy, or invent project task truth.

A successful Builder process exit means construction execution finished; it does not mean review passed or integration is safe. The task moves into the review stage and still requires the existing SHA-bound review contract before any later automation can treat it as passed.

## Remaining manual acceptance

Run one harmless task through the TUI using the actual locally installed `opencode` executable. Confirm queued/started/session-bound/terminal evidence appears, selection survives polling, and an active dispatch can be explicitly cancelled. T010 and T012 remain `REVIEW` until that machine-level check passes.
