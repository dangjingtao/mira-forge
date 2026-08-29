# Mira Forge

Local AI Engineering Orchestrator.

Mira Forge is an experimental global local control plane for coordinating coding agents, durable runtime state, SHA-bound review handoff, dispatch readiness, and lightweight progress visibility across multiple repositories.

## Current status

Stable first wave on `main`:

- one local control service on `127.0.0.1:47831`;
- durable runtime state under `~/.mira-forge/state.json`;
- local project registry;
- Batch / Task runtime API;
- minimal global progress dashboard;
- persistence and state-domain verification.

Second wave implemented and verified on `dev`:

- provider-neutral Builder / Reviewer / Git adapter registry and heartbeat;
- durable Builder / Reviewer session lifecycle;
- durable SHA-bound review handoff history;
- invalidation of stale review passes when task SHA changes;
- dependency validation and read-only dispatch readiness;
- active Builder-session dispatch gate.

Forge still does **not** launch OpenCode, Codex, Pi Agent or another Builder/Reviewer itself. Those integrations belong behind adapters in a later milestone.

## Run locally

```bash
npm install
npm run dev
```

Development uses two local ports:

- control plane: `http://127.0.0.1:47831`
- dashboard Vite dev server: normally `http://127.0.0.1:47832`

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

Verification runs unit/domain tests, TypeScript checking, dashboard build, the control-plane smoke, and the dispatch-readiness smoke.

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

GET   /api/adapters
POST  /api/adapters
POST  /api/adapters/:adapterId/heartbeat

GET   /api/sessions
POST  /api/sessions
PATCH /api/sessions/:sessionId

GET   /api/reviews
POST  /api/reviews
POST  /api/reviews/:reviewId/result
```

Example project registration:

```bash
curl -X POST http://127.0.0.1:47831/api/projects \
  -H 'content-type: application/json' \
  -d '{
    "name": "Com Design Prototype",
    "rootPath": "/Users/tomz/code/com-design-prototype",
    "repository": "https://github.com/dangjingtao/com-design-prototype",
    "integrationBranch": "dev"
  }'
```

## Project truth vs runtime truth

Managed repositories keep their own product/task truth, for example `TODO → DOING → REVIEW → PASS`.

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

Adapters, sessions and review handoffs are runtime evidence, not a replacement requirement system. Review PASS is only actionable for the exact SHA that was handed to the reviewer. Dispatch readiness is read-only and does not start an agent.

See `docs/architecture.md` and `docs/workbench/00-work-ledger.md`.

The dashboard interaction contract and keyboard event model are documented in `docs/tui-interaction.md`.

## Branches

- `main`: stable baseline
- `dev`: active development and integration
