# T002 — Durable runtime ledger

Status: PASS

## Goal

Persist Forge runtime facts outside managed repositories so review/client disconnects do not lose orchestration state.

## Acceptance

- Default state path is `~/.mira-forge/state.json`.
- Writes are atomic via temp-file + rename.
- Concurrent mutations are serialized in-process.
- Invalid state files fail loudly instead of being silently replaced.

## Evidence

Implemented in `server/store.mjs` with `node:test` coverage. Verify #18 passed `test + typecheck + build + smoke` on the current `dev` baseline.
