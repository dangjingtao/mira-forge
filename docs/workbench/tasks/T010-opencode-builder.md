# T010 — OpenCode local Builder adapter

Status: REVIEW

## Goal

Implement the first real Builder adapter by launching OpenCode in non-interactive mode from Forge while keeping OpenCode-specific process behavior outside core state/domain logic.

## Acceptance

- Launch `opencode run --format json --dir <projectRoot>` through a dedicated adapter module.
- Support optional model and agent selection without hard-coding a provider/model.
- Never pass `--dangerously-skip-permissions` or equivalent permission-bypass flags.
- Parse JSONL events defensively and capture the first observed OpenCode `sessionID` as the Forge session's `externalSessionId`.
- Treat process exit as authoritative completion/failure evidence; missing/malformed JSONL lines must not crash Forge.
- Keep bounded stderr/final text evidence rather than unlimited process output.
- Allow executable/prefix-arg overrides through process environment so CI can verify the full process path without requiring OpenCode installation.

## Dependencies

- T009 durable dispatch attempt — PASS.

## Out of scope

- Continuing old OpenCode sessions.
- OpenCode server/attach mode.
- Permission auto-approval.
- Reviewer adapter.

## Repository evidence

Implemented in `server/opencode-adapter.mjs`. Unit tests cover exact argument construction, explicit absence of permission-bypass flags, JSONL parsing, bounded process output and exit evidence. `scripts/fake-opencode.mjs` plus `dispatch-smoke.mjs` run the real Forge child-process path in CI. Verify #51 passed on `905f6c5767df`.

## Remaining acceptance

Run one harmless dispatch on the user's machine using the actual locally installed `opencode` executable and confirm Forge observes process start, OpenCode session binding and terminal status. Until that real-binary check is done, this card remains `REVIEW` rather than claiming PASS from a fake executable alone.
