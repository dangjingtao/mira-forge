# T007 — SHA-bound review handoff history

Status: TODO

## Goal

Make review handoff an explicit durable record rather than a few mutable task fields, while preserving the rule that a review result is valid only for one concrete commit SHA.

## Acceptance

- Create a review handoff for an existing task and its concrete `currentSha`.
- Record reviewer session, requested SHA, round, result and timestamps.
- Accept pass/fail results only when the reviewed SHA exactly matches the handoff/task SHA.
- Preserve previous review rounds as history.
- Changing task `currentSha` must make earlier pass results non-actionable without deleting history.
- Task `reviewedSha` / `review_passed` state is derived or updated only from a valid handoff result.

## Dependencies

- T006 session lifecycle.

## Out of scope

- AI review prompt design.
- GitHub PR review comments.
- Automatic merge.

## Validation

Review-domain regression tests + API smoke + repository Verify.
