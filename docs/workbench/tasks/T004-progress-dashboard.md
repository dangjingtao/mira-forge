# T004 — Minimal global progress dashboard

Status: PASS

## Goal

Make multiple local AI construction jobs visible in one place without creating another PM system.

## Acceptance

- Shows project and task counts.
- Shows task runtime status and review round.
- Shows multiple projects from the same global state.
- Can register a local project.
- Does not own orchestration state in the browser.

## Evidence

Implemented in `src/App.tsx` and `src/styles.css`. Verify #18 passed `test + typecheck + build + smoke`. Manual browser black-box on 2026-08-29 confirmed project registration succeeds and remains present after a full page refresh.
