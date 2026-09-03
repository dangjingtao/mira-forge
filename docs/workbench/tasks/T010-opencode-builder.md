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

## Repository evidence

Implemented in `server/opencode-adapter.mjs`. Unit tests cover exact argument construction, explicit absence of permission-bypass flags, JSONL parsing, bounded process output and exit evidence. `scripts/fake-opencode.mjs` plus `dispatch-smoke.mjs` exercise the full Forge child-process path in CI.

T013 adds a dedicated machine-level First-run Check that uses the same configured OpenCode runner in a disposable temp workspace and verifies real process start, `sessionID`, normal exit and a marker file without touching a registered project.

## Remaining acceptance

The only remaining human fact is machine-local: whether the user's actual `opencode` installation/provider configuration works on this machine.

Do **not** create a fake project, Batch, task card or curl request for this check. In the TUI press `a` (or click `first-run check`), submit once, and require `PASS`. That single result is sufficient to close T010.
