# Mira Forge V1 Architecture

## Position

Mira Forge is a single global local control plane for AI engineering work across multiple repositories.

```text
Managed Projects / Task Cards
            |
            v
      Mira Forge :47831
      /      |       \
 Ledger   Adapters   Dashboard
            |          :47832 dev
       Builders / Reviewers
```

The dashboard is a client. A project Vite server is a preview runtime. Neither owns orchestration state.

## State layers

Managed projects keep product truth such as `TODO / DOING / REVIEW / PASS` in their own task system.

Forge keeps ephemeral/runtime engineering state:

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

The two layers will be mapped by project adapters later; they are deliberately not the same state machine.

## Durable state

Default file:

```text
~/.mira-forge/state.json
```

The server writes through a temporary file and rename so a dashboard refresh, Vite restart or reviewer disconnect does not become the state boundary.

## First API surface

- `GET /api/health`
- `GET /api/state`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/batches`
- `POST /api/batches`
- `PATCH /api/batches/:batchId/tasks/:taskId`

Adapter/session endpoints intentionally wait for the next milestone.
