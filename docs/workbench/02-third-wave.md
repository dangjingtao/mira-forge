# Mira Forge Third Wave — First Real Dispatch

Status: BACKEND VERIFIED on `feat/dispatch-opencode`; local OpenCode + TUI acceptance remain

Goal: make Forge useful for its first real construction run without expanding into automatic review, merge, deployment, or parallel integration.

Current status:

1. T009 Dispatch request and durable attempt — PASS
2. T010 OpenCode local Builder adapter — REVIEW (real local `opencode` binary acceptance pending)
3. T011 Process supervision and runtime events — PASS
4. T012 TUI dispatch wiring — BLOCKED until the current keyboard-first UI source is committed/pushed

Verify #51 passes tests, typecheck, build, the original control-plane/readiness smoke, and the new fake-OpenCode dispatch smoke on head `905f6c5767df`.

## First-use policy

The first usable Builder path is intentionally serial: one Builder adapter may supervise only one active dispatch at a time. This avoids false liveness and working-tree contention before worktree/scheduler contracts exist.

## Boundary

The control plane owns dispatch/session/runtime evidence. OpenCode remains an adapter implementation. Forge does not pass permission-bypass flags, auto-push, auto-merge, deploy, or invent project task truth.

A successful Builder process exit means construction execution finished; it does not mean review passed or integration is safe. The task moves into the review stage and still requires the existing SHA-bound review contract before any later automation can treat it as passed.
