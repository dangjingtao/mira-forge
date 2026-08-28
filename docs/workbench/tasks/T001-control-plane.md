# T001 — Bootstrap local control service

Status: REVIEW

## Goal

Create one global local HTTP service that stays independent from managed-project Vite servers and AI clients.

## Acceptance

- Defaults to `127.0.0.1:47831`.
- Exposes health and state APIs.
- Can serve the built dashboard from the same service.
- Closing a dashboard or project Vite server does not own or erase Forge state.

## Evidence

Implemented in `server/index.mjs`. Repository verification is still required before PASS.
