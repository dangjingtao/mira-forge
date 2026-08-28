# Mira Forge

Local AI Engineering Orchestrator.

Mira Forge is an experimental global local control plane for coordinating coding agents, durable task state, review handoff, and lightweight progress visibility across multiple repositories.

## First-wave status

Implemented on `dev`:

- one local control service on `127.0.0.1:47831`;
- durable runtime state under `~/.mira-forge/state.json`;
- local project registry;
- Batch / Task runtime API;
- minimal global progress dashboard;
- persistence and state-domain tests;
- GitHub Actions verification.

Builder and reviewer adapters are deliberately not part of this first wave.

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

## Minimal API

```text
GET   /api/health
GET   /api/state
GET   /api/projects
POST  /api/projects
GET   /api/batches
POST  /api/batches
PATCH /api/batches/:batchId/tasks/:taskId
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

Forge only keeps runtime engineering facts such as:

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

See `docs/architecture.md` and `docs/workbench/00-work-ledger.md`.

## Branches

- `main`: stable baseline
- `dev`: active development
