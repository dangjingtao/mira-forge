# Mira Forge Third Wave — First Real Dispatch

Status: MERGED INTO `dev`; V1 HUMAN ACCEPTANCE IN PROGRESS

The current V1-wide acceptance decision and the reduced human gate are tracked in `docs/v1-status.md`.

Goal: make Forge useful for its first real construction run without expanding into automatic review, merge, deployment, or parallel integration.

Current status:

1. T009 Dispatch request and durable attempt — PASS
2. T010 OpenCode local Builder adapter — REVIEW (actual local provider/configuration acceptance pending)
3. T011 Process supervision and runtime events — PASS
4. T012 TUI dispatch wiring — REVIEW (first normal real-project dispatch remains observational acceptance)
5. T013 One-step First-run Check — PASS

Verify #63 passes tests, typecheck, build, the control-plane/readiness smoke, the fake-OpenCode dispatch smoke, and the First-run Check path on `dev`.

## First-use policy

The first usable Builder path is intentionally serial: one Builder adapter may supervise only one active dispatch at a time. This avoids false liveness and working-tree contention before worktree/scheduler contracts exist.

The keyboard-first TUI now exposes task selection, `d` dispatch, `x` cancel, command-palette equivalents, Builder busy state, and durable runtime-event history. Dispatch still requires an explicit task-card reference and a submit action; task navigation never starts a Builder.

## Boundary

The control plane owns dispatch/session/runtime evidence. OpenCode remains an adapter implementation. Forge does not pass permission-bypass flags, auto-push, auto-merge, deploy, or invent project task truth.

A successful Builder process exit means construction execution finished; it does not mean review passed or integration is safe. The task moves into the review stage and still requires the existing SHA-bound review contract before any later automation can treat it as passed.

## Remaining manual acceptance

Run the First-run Check once with the actual locally installed `opencode` executable. Then observe the first normal real-project task dispatch through the TUI. T010 closes on a First-run Check `PASS`; T012 closes observationally when selection, explicit dispatch, runtime evidence, and review-stage landing are observed. Cancellation remains covered by automated race/supervision tests and may be accepted when naturally exercised.
