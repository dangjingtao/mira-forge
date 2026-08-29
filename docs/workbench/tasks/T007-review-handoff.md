# T007 — SHA-bound review handoff history

Status: PASS

## Goal

Make review handoff an explicit durable record rather than a few mutable task fields, while preserving the rule that a review result is valid only for one concrete commit SHA.

## Acceptance

- Create a review handoff for an existing task and its concrete `currentSha`.
- Require an active reviewer session bound to the same task.
- Record reviewer session, requested SHA, round, result and timestamps.
- Accept non-cancelled results only when `reviewedSha` exactly matches the handoff SHA.
- Preserve previous review rounds as history.
- Direct task PATCH cannot forge `review_passed` or `reviewedSha`.
- Changing task `currentSha` makes earlier pass results non-actionable without deleting history.
- A late review result for an older SHA is recorded but cannot change the task to `review_passed`.
- Batch status remains derived from the task state after review transitions.

## Dependencies

- T006 session lifecycle — PASS.

## Out of scope

- AI review prompt design.
- GitHub PR review comments.
- Automatic merge.

## Evidence

Implemented in `server/domain.mjs`, `server/store.mjs` and `server/index.mjs`; tests cover exact-SHA binding, anti-forgery, late stale results, pass invalidation after SHA changes, history retention and batch-state derivation. HTTP smoke covers Builder → Reviewer → review handoff → SHA-bound PASS. GitHub Actions Verify #27 passed `test + typecheck + build + smoke` on commit `ae6de6197065`.
