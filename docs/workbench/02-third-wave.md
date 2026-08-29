# Mira Forge Third Wave — First Real Dispatch

Status: IN PROGRESS on `feat/dispatch-opencode`

Goal: make Forge useful for its first real construction run without expanding into automatic review, merge, deployment, or parallel integration.

Order:

1. T009 Dispatch request and durable attempt — DOING
2. T010 OpenCode local Builder adapter — TODO
3. T011 Process supervision and runtime events — TODO
4. T012 TUI dispatch wiring — BLOCKED until the current keyboard-first UI source is committed/pushed

## Boundary

The control plane owns dispatch/session/runtime evidence. OpenCode remains an adapter implementation. Forge must not pass permission-bypass flags, auto-push, auto-merge, deploy, or invent project task truth.

A successful Builder process exit means construction execution finished; it does not mean review passed or integration is safe. The task moves into the review stage and still requires the existing SHA-bound review contract before any later automation can treat it as passed.
