# T003 — Project registry and runtime API

Status: REVIEW

## Goal

Provide the minimum machine contract needed before Builder and Reviewer adapters exist.

## Acceptance

- Register a local project without cloning its requirement/task truth.
- Create a Batch containing task references.
- Update task runtime state, builder/session metadata, SHAs and review round.
- Reject unknown runtime states.
- Batch status derives from task runtime state.

## Evidence

Implemented in `server/domain.mjs` and `server/index.mjs` with domain tests. Repository verification is still required before PASS.
