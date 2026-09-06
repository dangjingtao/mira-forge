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
   |            /       |       \
   |       OpenCode   PiAgent   Codex Desktop
   |
   +-- Main Threads -- Thread Events
   |       |             |
   |   OpenCode /        +-- message/thinking/tool/status/artifact/handoff
   |   Codex Desktop /
   |   Codex CLI
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
- `threadEvents`: bounded normalized `message / thinking / tool / status / artifact / handoff` history.

Older schema-1 files that do not contain later additive arrays remain readable.

The server writes through a temporary file and rename, and serializes in-process mutations, so a dashboard refresh, Vite restart or reviewer disconnect does not become the state boundary.

## Main thread boundary

A main thread is a durable project conversation for discussion, inspection, planning, Task Card operations and dispatch decisions. It is deliberately not a Builder session.

The provider-neutral minimum contract is:

- one registered project;
- one `opencode`, `codex-desktop`, or `codex` adapter selection;
- durable user/assistant messages plus bounded normalized provider events;
- an external provider thread/session ID when the provider supports durable continuation;
- explicit repository-task capabilities implemented through `server/repo-task-source.mjs`;
- explicit dispatch handoff containing only `projectId + taskId + taskRef + preferredBuilder`.

OpenCode main threads run with the `plan` agent and a runtime permission override that denies everything by default while allowing read-oriented inspection tools.

Codex has two separate main-thread adapters rather than pretending every local Codex client is the same transport:

- `codex-desktop` discovers the Codex backend bundled in the current macOS `ChatGPT.app` or legacy `Codex.app` (or uses `MIRA_FORGE_CODEX_DESKTOP_BIN`) and launches its documented `app-server` JSONL transport. Forge performs the required `initialize` / `initialized` handshake, uses `thread/start` or exact-ID `thread/resume`, then `turn/start` with `approvalPolicy: never` and a read-only sandbox. The resulting Codex thread is persisted in the same Codex home used by the desktop product; Forge does not scrape the desktop UI or attach to a private stdio process owned by the running app.
- `codex` remains the standalone CLI path and uses `codex exec --json` with a read-only sandbox and non-interactive approval policy.

Both Codex paths require an exact resume identity. A different returned thread ID is failure rather than a silently substituted conversation. Provider-reported file changes are treated as a main-thread contract violation.

The desktop adapter deliberately launches a short-lived app-server process from the desktop bundle instead of depending on the currently undocumented/shared-daemon startup switch. This avoids making Forge correctness depend on whether a particular desktop release exposes its private app-server. A Codex thread actively owned for writing by another app-server can still reject resume; Forge surfaces that provider error rather than stealing ownership.

Task-source writes and dispatch handoffs are separate explicit Forge capabilities. A model response cannot create a Task Card or launch a Builder merely by mentioning one. Handoff creation records a reference event only; existing dispatch readiness and dispatch APIs remain the authority for actual construction.

Main-thread provider details stay behind adapter modules. Forge stores only bounded normalized metadata rather than raw JSONL streams. On control-plane startup, a thread left `running` is reconciled to an explicit interrupted/error state instead of pretending the old process survived.

## Adapter, dispatch and session boundary

Adapters describe capabilities and liveness. Core state does not depend on a particular agent implementation.

Builder and Reviewer sessions bind an adapter to one project/batch/task execution. Session lifecycle is durable and independent from task engineering state. Completing or disconnecting a session does not erase task state or previous sessions.

A dispatch attempt is the durable evidence that Forge explicitly tried to launch a Builder for a ready task. Provider-specific CLI/process behavior lives behind a runner adapter. T016 exposes three built-in product-level Builder choices behind that boundary:

- `opencode` preserves the verified `opencode run --format json --dir <projectRoot>` path;
- `piagent` uses Pi's non-interactive JSON-lines mode and observes its session header/tool lifecycle without copying raw streams into durable state;
- `codex` reuses the executable bundled with Codex/ChatGPT Desktop by default and runs bounded `workspace-write` non-interactive construction without requiring a separately installed PATH CLI.

The dispatch request may name a product-level `builder`/`preferredBuilder`, while durable sessions and dispatches bind the resolved adapter ID. Explicit custom Builder adapter IDs remain possible and do not change the core state schema.

For first use, Forge allows only one active Builder dispatch globally across adapter choices. Parallel Builder execution is deferred until scheduler/worktree contracts exist; merely adding providers must not accidentally create concurrent unmanaged write lanes. This also prevents a completed child from falsely making a shared construction surface appear free while another Builder is still running.

Forge never treats child-process success as review PASS. Successful construction closes the Builder session and moves the task into the review stage only.

## Process supervision

The local control process owns live child-process handles. Durable state records milestones, but Forge does not pretend those in-memory handles survive a crash.

- normal process exit becomes completed/failed evidence;
- explicit cancel terminates the child and interrupts the task;
- normal Forge shutdown interrupts supervised children and clears adapter liveness;
- startup reconciliation marks leftover starting/running attempts interrupted and their sessions disconnected;
- late terminal callbacks cannot overwrite an already terminal dispatch.

Builder adapters parse provider output defensively and publish only bounded normalized evidence. OpenCode's existing `sessionID`, Pi's JSON session header ID and Codex's reported thread ID all map to the same optional `externalSessionId` field when observed. Malformed provider lines are ignored instead of crashing the control plane. Provider-reported terminal errors are failure evidence even when a wrapper process exits zero.

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
- the execution layer still applies the stricter first-use single-active-Builder policy across adapter choices;
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

Automatic Reviewer dispatch, worktree scheduling, richer live Builder streaming and parallel integration remain later milestones.
