# Task Cards

Mira Forge uses repository Task Cards for project truth and keeps only runtime orchestration state in the global local service.

The normative repository Markdown format is `docs/task-source-contract.md` (**Mira Forge Task Source Contract v0.1**).

Canonical repository statuses for this project are:

```text
TODO -> DOING -> REVIEW -> PASS
```

The Work Ledger row order is the default planning priority among otherwise eligible tasks. Task IDs are durable and must not be reused. Builder/runtime completion does not automatically change repository task status.
