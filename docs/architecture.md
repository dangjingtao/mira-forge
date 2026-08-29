# Mira Forge V1 Architecture

## Position

Mira Forge is a single global local control plane for AI engineering work across multiple repositories.

```text
Managed Projects / Task Cards
            |
            v
      Mira Forge :47831
      /      |        \
 Ledger   Adapters   Dashboard
   |       /   \       :47832 dev
   |   Builders Reviewers
   |        |
   +-- Sessions -- Review Handoffs
             \
              Dispatch Readiness (read-only)
```

The dashboard is a client. A project Vite server is a preview runtime. Neither owns orchestration state.

The dashboard follows a keyboard-first, terminal-inspired interaction contract. See `docs/tui-interaction.md` for the region model, key bindings, event rules, and UI acceptance checklist.

## State layers

Managed projects keep product truth such as `TODO / DOING / REVIEW / PASS` in their own task system.

Forge keeps runtime engineering state such as:

```text
waiting
building
reviewing
fixing
waiting_integration
interrupted
stale
review_passed
integrated
```

The two layers are deliberately not the same state machine.

## Durable runtime collections

Default state file:

```text
~/.mira-forge/state.json
```

Schema version 1 currently contains additive collections for:

- `projects`: registered local project entry points;
- `batches`: task references and runtime task state;
- `adapters`: provider-neutral Builder / Reviewer / Git descriptors and heartbeat state;
- `sessions`: durable Builder / Reviewer execution-session history;
- `reviews`: SHA-bound review-handoff history.

Older schema-1 files that do not yet contain the additive adapter/session/review arrays remain readable.

The server writes through a temporary file and rename, and serializes in-process mutations, so a dashboard refresh, Vite restart or reviewer disconnect does not become the state boundary.

## Adapter and session boundary

Adapters describe capabilities and liveness. They do not make the control plane depend on a particular agent implementation.

Builder and Reviewer sessions bind an adapter to one project/batch/task execution. Session lifecycle is durable and independent from task engineering state. Completing or disconnecting a session does not erase task state or previous sessions.

Forge V1 still does not spawn OpenCode, Codex, Pi Agent or another agent process.

## Review handoff invariant

A review request binds one active Reviewer session to one concrete task SHA.

A `passed` result is actionable only when:

```text
reviewedSha == requestedSha == task.currentSha
```

Direct task mutation cannot manufacture `review_passed` or `reviewedSha`. When task `currentSha` changes, an earlier PASS remains in review history but becomes non-actionable and can no longer justify integration.

## Dispatch readiness

Readiness is a pure/read-only decision surface. It does not launch agents or mutate task state.

For the current milestone:

- only `waiting` and `fixing` tasks are dispatchable;
- every `dependsOn` task must be `integrated`;
- a task with an active Builder session is blocked;
- missing, self and cyclic dependency references are invalid;
- multiple independent tasks may be reported ready together;
- parallel construction still does not imply parallel integration.

Policy overrides for dependency satisfaction are intentionally deferred.

## Runtime API surface

- `GET /api/health`
- `GET /api/state`
- `GET /api/meta`
- `GET|POST /api/projects`
- `GET|POST /api/batches`
- `PATCH /api/batches/:batchId/tasks/:taskId`
- `GET /api/batches/:batchId/dispatch-ready`
- `GET|POST /api/adapters`
- `POST /api/adapters/:adapterId/heartbeat`
- `GET|POST /api/sessions`
- `PATCH /api/sessions/:sessionId`
- `GET|POST /api/reviews`
- `POST /api/reviews/:reviewId/result`

Actual Builder/Reviewer process launching and Git integration remain later adapter milestones.
