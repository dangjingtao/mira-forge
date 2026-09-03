# Mira Forge

Local AI Engineering Orchestrator.

Mira Forge is a local control plane for coordinating real repository Task Cards, durable project conversations, coding-agent dispatch, runtime evidence and review handoff across multiple local projects.

It is **not** a coding agent and **not** a replacement task-management system. OpenCode, PiAgent and Codex do the actual agent work; Forge coordinates and records the engineering control loop around them.

## Product guide

For the human-facing explanation of what Forge is, how the pieces relate, and what is actually usable through T018, see:

- [`docs/user-guide.zh-CN.md`](docs/user-guide.zh-CN.md) — 中文产品 / 使用说明
- [`docs/architecture.md`](docs/architecture.md) — architecture and runtime boundaries
- [`docs/workbench/00-work-ledger.md`](docs/workbench/00-work-ledger.md) — authoritative task ledger

## Current `dev` status

The product loop implemented through T018 is:

```text
Registered Project
      ↓
Main Thread
(discuss / inspect / plan)
      ↓
Repository Task Card
      ↓
explicit Dispatch
      ↓
Builder
(OpenCode / PiAgent / Codex)
      ↓
Runtime evidence
      ↓
reviewing
      ↓
Builder result handoff → related Main Thread
```

### Accepted capabilities

- one local control service with durable state under `~/.mira-forge/state.json`;
- local project registry and repository-native Task Source;
- Batch / Task runtime bindings without copying Task Card bodies into Forge state;
- provider-neutral adapter/session/dispatch/review contracts;
- SHA-bound review handoff and stale-review invalidation;
- durable Main Threads for project discussion and dispatch decisions;
- Main Thread adapters for OpenCode, Codex Desktop and Codex CLI;
- Builder adapters for OpenCode, PiAgent and Codex;
- explicit dispatch and cancellation with process supervision;
- global serial first-use Builder safety across built-in providers;
- successful Builder completion moves construction to `reviewing`, never directly to Review PASS;
- compact keyboard-first Web/TUI surface with persistent Main Thread rail;
- compact runtime summary plus Runtime Inspector and on-demand Event Log;
- durable Builder terminal result handoff back to an explicitly related Main Thread.

T015, T016 and T017 are `PASS`.

T018 is currently `REVIEW`: implementation and automated verification are merged to `dev`; the remaining acceptance is one real Builder product-loop smoke confirming the live runtime summary/inspector, truthful timing, terminal Builder-result handoff and next-turn Main Thread continuation on the actual local provider path.

Forge still does **not** automatically review, retry/fix, merge, deploy or run parallel unmanaged Builders.

## Run locally

```bash
npm install
npm run dev
```

Development uses two local ports:

- control plane: `http://127.0.0.1:47831`
- dashboard Vite dev server: normally `http://127.0.0.1:47832`

Main-thread provider requests default to a 50-minute timeout (`3,000,000ms`). Override it with `MIRA_FORGE_MAIN_THREAD_TIMEOUT_MS` when needed. The First-run Check keeps its separate 2-minute timeout.

The Vite server is only a development UI. Forge state belongs to the control plane, not to Vite.

Build and run the single-service form:

```bash
npm run build
npm start
```

Then open `http://127.0.0.1:47831`.

## Verify

```bash
npm run check
```

The repository verification contract includes tests, TypeScript checking, dashboard build and smoke coverage. Real provider credentials, model/network availability and final human observational acceptance remain machine-local facts where the relevant Task Card explicitly requires them.

## Runtime API

```text
GET   /api/health
GET   /api/state
GET   /api/meta

GET   /api/projects
POST  /api/projects

GET   /api/batches
POST  /api/batches
PATCH /api/batches/:batchId/tasks/:taskId
GET   /api/batches/:batchId/dispatch-ready
POST  /api/batches/:batchId/tasks/:taskId/dispatch

GET   /api/adapters
POST  /api/adapters
POST  /api/adapters/:adapterId/heartbeat

GET   /api/sessions
POST  /api/sessions
PATCH /api/sessions/:sessionId

GET   /api/reviews
POST  /api/reviews
POST  /api/reviews/:reviewId/result

GET   /api/dispatches
POST  /api/dispatches/:dispatchId/cancel
GET   /api/events

GET   /api/threads
POST  /api/threads
GET   /api/threads/:threadId
POST  /api/threads/:threadId/messages
GET   /api/threads/:threadId/tasks
POST  /api/threads/:threadId/tasks
GET   /api/threads/:threadId/tasks/:taskId
PATCH /api/threads/:threadId/tasks/:taskId
POST  /api/threads/:threadId/handoffs
```

## Project truth vs runtime truth

Managed repositories keep their own product/task truth, for example:

```text
TODO → DOING → REVIEW → PASS
```

Forge keeps runtime engineering facts such as:

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

The two state layers are deliberately different.

Adapters, sessions, review handoffs, dispatch attempts and runtime events are execution evidence, not a replacement requirement system. A successful Builder process exit only moves construction into the review stage. Review PASS is actionable only when it is valid for the concrete reviewed SHA.

## Branches

- `main`: stable baseline
- `dev`: active development and integration
