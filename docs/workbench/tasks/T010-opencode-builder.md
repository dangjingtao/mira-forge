# T010 — OpenCode local Builder adapter

Status: TODO

## Goal

Implement the first real Builder adapter by launching OpenCode in non-interactive mode from Forge while keeping OpenCode-specific process behavior outside core state/domain logic.

## Acceptance

- Launch `opencode run --format json --dir <projectRoot>` through a dedicated adapter module.
- Support optional model and agent selection without hard-coding a provider/model.
- Never pass `--dangerously-skip-permissions` or equivalent permission-bypass flags.
- Parse JSONL events defensively and capture the first observed OpenCode `sessionID` as the Forge session's `externalSessionId`.
- Treat process exit as authoritative completion/failure evidence; missing/malformed JSONL lines must not crash Forge.
- Keep bounded stderr/final text evidence for diagnostics rather than copying unlimited process output into state.
- Make the executable/prefix args configurable through process environment so CI can use a fake OpenCode process without requiring OpenCode installation.

## Dependencies

- T009 durable dispatch attempt.

## Out of scope

- Continuing old OpenCode sessions.
- OpenCode server/attach mode.
- Permission auto-approval.
- Reviewer adapter.

## Validation

Unit tests must cover argument construction, permission-boundary flags, JSONL parsing and process outcomes. HTTP smoke must run against a fake executable and prove the control-plane path end to end.
