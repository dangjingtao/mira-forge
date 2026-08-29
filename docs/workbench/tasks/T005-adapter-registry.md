# T005 — Adapter registry and heartbeat

Status: DOING

## Goal

Give the control plane a provider-neutral registry for Builder, Reviewer and Git adapters without making core state depend on any adapter process staying alive.

## Acceptance

- Persist adapter descriptors in Forge runtime state.
- Support adapter kinds `builder`, `reviewer` and `git`.
- Register adapters with stable IDs, names and capability strings.
- Reject duplicate adapter IDs and unknown kinds/statuses.
- Accept heartbeats that update `lastSeenAt` and availability state.
- Adapter disconnect/offline state must not erase projects, batches or tasks.
- Expose list/register/heartbeat APIs.
- Existing schema-1 state files without an `adapters` array remain readable.

## Out of scope

- Launching OpenCode, Codex or Pi Agent.
- Storing credentials, tokens or remote secrets.
- Automatic stale-timeout scheduling.

## Validation

Domain tests + persistence compatibility + HTTP smoke + repository Verify.
