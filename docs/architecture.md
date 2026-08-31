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
   |        \
   |         Dispatch Attempts -- Runtime Events
   |                 |
   |             Process Runner
   |                 |
   |          OpenCode local adapter
   |
   +-- Main Threads -- Thread Events
   |       |             |
   |   Codex/OpenCode    +-- message/tool/status/artifact/handoff
   |       |
   |       +-- explicit Task Source capabilities
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

## Repository-native task source

A registered project may point Forge at its repository-owned Markdown task truth through `taskLedger` and `taskDir`. The repository Markdown task source in `server/repo-task-source.mjs` is deliberately thin:

- inspect the configured ledger without mutating it;
- resolve a task ID to a repository-relative Task Card reference;
- explicitly create a Task Card and matching ledger row;
- explicitly update Task Card title/status or replace validated Task Card content while keeping the ledger index aligned;
- reject missing/malformed/ambiguous task truth instead of inventing it.

Task-source reads and writes are bounded to the registered project root, including real-path checks for configured ledger/task directories and resolved Task Cards. Read operations never mutate repository truth. Write operations are explicit and use atomic per-file replacement with rollback of the Task Card when the ledger write fails.

The normalized task-source result is a reference surface (`id`, title/status index data, `taskRef`, `ledgerRef`, bounded warnings), not another requirements database. Full Task Card content is never copied into `~/.mira-forge/state.json` by this contract. Runtime batches/tasks remain execution bindings rather than authoritative requirement records.

T014 intentionally kept the task source as a module boundary. T015 now consumes that boundary from the main-thread runtime and exposes only explicit thread-scoped task capabilities; the Task Card body still remains repository truth.

## Durable runtime collections

Default state file:

```text
~/.mira-forge/state.json
```

Schema version 1 contains additive collections for:

- `projects`: registered local project entry points;
- `batches`: task references and runtime task state;
- `adapters`: provider-neutral Builder / Reviewer / Git descriptors and heartbeat state;
- `sessions`: durable Builder / Reviewer execution-session history;
- `reviews`: SHA-bound review-handoff history;
- `dispatches`: durable Builder dispatch attempts and bounded terminal evidence;
- `events`: append-only Builder/runtime milestones used by the control surface;
- `threads`: durable project main/dispatch conversations, separate from Builder/Reviewer sessions;
- `threadEvents`: bounded normalized `message / tool / status / artifact / handoff` history.

Older schema-1 files that do not contain later additive arrays remain readable.

The server writes through a temporary file and rename, and serializes in-process mutations, so a dashboard refresh, Vite restart or reviewer disconnect does not become the state boundary.

## Main thread boundary

A main thread is a durable project conversation for discussion, inspection, planning, Task Card operations and dispatch decisions. It is deliberately not a Builder session.

The provider-neutral minimum contract is:

- one registered project;
- one `codex` or `opencode` adapter selection;
- durable user/assistant messages plus bounded normalized provider events;
- an external provider thread/session ID when the provider supports durable continuation;
- explicit repository-task capabilities implemented through `server/repo-task-source.mjs`;
- explicit dispatch handoff containing only `projectId + taskId + taskRef + preferredBuilder`.

OpenCode main threads run with the `plan` agent and a runtime permission override that denies everything by default while allowing read-oriented inspection tools. Codex main threads run through `codex exec --json` with `--sandbox read-only --ask-for-approval never`. A Codex resume must report the exact requested thread ID; a different ID is treated as failure rather than silently accepting a new conversation. Provider-reported file changes are also treated as a main-thread contract violation.

Task-source writes and dispatch handoffs are separate explicit Forge capabilities. A model response cannot create a Task Card or launch a Builder merely by mentioning one. Handoff creation records a reference event only; existing dispatch readiness and dispatch APIs remain the authority for actual construction.

Main-thread provider details stay behind adapter modules. Forge stores only bounded normalized metadata rather than raw JSONL streams. On control-plane startup, a thread left `running` is reconciled to an explicit interrupted/error state instead of pretending the old process survived.

## Adapter, dispatch and session boundary

Adapters describe capabilities and liveness. Core state does not depend on a particular agent implementation.

Builder and Reviewer sessions bind an adapter to one project/batch/task execution. Session lifecycle is durable and independent from task engineering state. Completing or disconnecting a session does not erase task state or previous sessions.

A dispatch attempt is the durable evidence that Forge explicitly tried to launch a Builder for a ready task. Provider-specific CLI/process behavior lives behind a runner adapter. The first implementation uses local `opencode run --format json --dir <projectRoot>`.

For first use, one Builder adapter supervises only one active dispatch at a time. Parallel Builder execution is deferred until scheduler/worktree contracts exist; this prevents a completed child from falsely marking a still-running shared adapter available and avoids unmanaged working-tree contention.

Forge never treats child-process success as review PASS. Successful construction closes the Builder session and moves the task into the review stage only.

## Process supervision

The local control process owns live child-process handles. Durable state records milestones, but Forge does not pretend those in-memory handles survive a crash.

- normal process exit becomes completed/failed evidence;
- explicit cancel terminates the child and interrupts the task;
- normal Forge shutdown interrupts supervised children and clears adapter liveness;
- startup reconciliation marks leftover starting/running attempts interrupted and their sessions disconnected;
- late terminal callbacks cannot overwrite an already terminal dispatch.

The OpenCode Builder adapter parses JSONL defensively and captures the first observed external `sessionID`, while child-process exit remains the authoritative completion signal.

Main-thread turns use the smaller T015 provider runner contract rather than the Builder supervision contract. Their durable continuation point is the external provider thread/session ID; a control-plane restart reconciles an in-flight turn as interrupted instead of adopting an unknown child process.

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
- the execution layer may still apply the stricter first-use single-active-Builder policy;
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
- `POST /api/batches/:batchId/tasks/:taskId/dispatch`
- `GET|POST /api/adapters`
- `POST /api/adapters/:adapterId/heartbeat`
- `GET|POST /api/sessions`
- `PATCH /api/sessions/:sessionId`
- `GET|POST /api/reviews`
- `POST /api/reviews/:reviewId/result`
- `GET /api/dispatches`
- `POST /api/dispatches/:dispatchId/cancel`
- `GET /api/events`
- `GET|POST /api/threads`
- `GET /api/threads/:threadId`
- `POST /api/threads/:threadId/messages`
- `GET|POST /api/threads/:threadId/tasks`
- `GET|PATCH /api/threads/:threadId/tasks/:taskId`
- `POST /api/threads/:threadId/handoffs`

Automatic Reviewer dispatch, Builder-adapter expansion, worktree scheduling, live streaming and parallel integration remain later milestones.
