# Mira Forge Task Source Contract v0.1

Status: **Normative for Forge repository-native Markdown task sources**

This contract defines the smallest portable task format that Mira Forge may read from a managed repository. It is intentionally not a replacement for Jira, Linear, GitHub Issues, or a full project-management schema.

The design goal is simple: **project task truth stays in the repository; Forge consumes references and owns only runtime orchestration state.**

The words **MUST**, **SHOULD**, and **MAY** are normative.

## 1. Source layout

A repository-native task source has two parts:

1. one Markdown **Work Ledger** that indexes tasks;
2. one Markdown **Task Card** per task.

Forge's conventional locations are:

```text
docs/workbench/00-work-ledger.md
docs/workbench/tasks/
```

Projects MAY configure different repository-relative paths. Configured or inferred paths MUST stay inside the registered project root after real-path resolution.

No YAML frontmatter, database, generated JSON manifest, or external task service is required.

## 2. Work Ledger

The Work Ledger is the human-readable task index and planning order.

It MUST contain one primary Markdown table with at least these columns:

```text
ID | Task | Status
```

Header matching is case-insensitive. Extra columns are allowed and SHOULD be preserved by Forge writers.

Example:

```md
| ID | Task | Status | Evidence |
| --- | --- | --- | --- |
| T016 | Builder Thread Adapters | REVIEW | Verify #191; human smoke pending |
| T017 | Compact Mira Web UI | TODO | |
| T018 | Live Runtime Surface | TODO | |
```

### Ledger rules

- `ID` MUST be unique within the ledger.
- `Task` MUST be a non-empty, single-line human title.
- `Status` MUST be non-empty.
- A row's position is its **default planning priority**: among otherwise eligible tasks, earlier rows are preferred before later rows.
- Ledger order does not override explicit dependency/readiness rules or an explicit human selection.
- A conforming ledger SHOULD contain only one table using all three reserved headers `ID`, `Task`, and `Status`; multiple competing task tables are ambiguous.
- Extra columns such as `Evidence`, `Owner`, `Area`, or project-specific metadata MAY exist. Forge v0.1 does not infer workflow semantics from unknown columns.

The ledger is an index, not the full execution contract.

## 3. Task identity

A Task ID is the durable identity shared by the ledger, Task Card, Forge runtime references, review history, and human discussion.

Task IDs MUST match:

```text
[A-Za-z0-9][A-Za-z0-9._-]*
```

Recommended forms include:

```text
T016
MOB-024
UI-012
```

Once published, a Task ID MUST NOT be renamed or reused for unrelated work. A title MAY change without changing the ID.

## 4. Task Card discovery

Each ledger Task MUST resolve to exactly one Markdown Task Card under the configured task directory.

Valid filenames begin with the exact Task ID and may use `.`, `_`, or `-` before a descriptive suffix:

```text
T016.md
T016-builder-thread-adapters.md
MOB-024_fix-thread-create.md
```

Two files matching the same Task ID are invalid because Forge cannot invent which one is authoritative.

## 5. Minimal Task Card contract

A source-conformant Task Card MUST contain:

1. a level-1 heading beginning with the exact Task ID;
2. one non-empty `Status:` line.

Recommended form:

```md
# T016 — Builder Thread Adapters

Status: REVIEW
```

The title in the Task Card SHOULD match the ledger `Task` cell. The Task Card `Status:` SHOULD match the ledger `Status` cell.

If ledger/card title or status drift exists, Forge MUST NOT silently repair or invent truth during a read. It may surface a warning. Explicit repository writes should keep the index and card aligned.

## 6. Builder-ready Task Card profile

The minimal card above is enough to identify a task, but a task intended for autonomous Builder dispatch SHOULD also contain a usable execution contract.

The recommended portable profile is:

```md
# T016 — Builder Thread Adapters

Status: TODO

## Goal
What outcome must exist when this task is complete.

## Context
Only the facts needed to understand the task.

## Scope
What may be changed.

## Constraints
Boundaries that must not be violated.

## Acceptance
Observable conditions that prove completion.

## Evidence
Filled during verification when useful.

## Handoff
Anything the next human/agent needs to know.
```

For Builder work, `Goal` and `Acceptance` SHOULD be present and concrete. `Scope` and `Constraints` SHOULD be present when the repository contains meaningful boundaries.

Forge v0.1 does not require every recommended section to parse a Task Card, and it does not reinterpret arbitrary prose as hidden scheduling metadata.

## 7. Canonical repository statuses

The portable Forge repository workflow has four core statuses:

```text
TODO -> DOING -> REVIEW -> PASS
```

Their meanings are:

- `TODO`: accepted work exists, but implementation has not started.
- `DOING`: the repository-level task is actively being worked on.
- `REVIEW`: implementation claims to satisfy the Task Card, but verification and/or human acceptance is still open.
- `PASS`: the task has satisfied its acceptance contract and required evidence exists.

Projects MAY use additional statuses, for example `BLOCKED`, but those are project extensions. Forge MUST treat unknown repository statuses as opaque rather than guessing their lifecycle meaning.

Among the canonical statuses, only `PASS` is terminal. `TODO`, `DOING`, and `REVIEW` remain unfinished project work.

A task SHOULD NOT move to `PASS` merely because a child process exited successfully. `PASS` is an acceptance judgment, not a process-exit code.

## 8. Evidence rule

`PASS` SHOULD be backed by inspectable evidence appropriate to the task, for example:

- a CI/Verify run;
- a named test or smoke result;
- a reviewed SHA;
- a human product-loop observation when automation cannot prove the fact.

Evidence MAY live in an `Evidence` ledger column, a Task Card `## Evidence` section, or both.

A missing Evidence column does not make the source invalid. Forge does not require teams to turn the ledger into a reporting database.

## 9. Repository truth vs Forge runtime truth

Repository task state and Forge runtime state are deliberately separate state machines.

Repository task truth uses the project workflow, normally:

```text
TODO / DOING / REVIEW / PASS
```

Forge runtime may use states such as:

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

The relationship is not a one-to-one mapping.

In particular:

- a **Batch** is a runtime grouping of Task references, not another Task system;
- a **Dispatch** is an execution attempt, not a repository status transition;
- Builder success moves the Forge runtime Task to `reviewing`; it MUST NOT automatically mark the repository Task `REVIEW` or `PASS`;
- repository Task status changes require an explicit repository write under project/user policy;
- Forge MUST NOT persist the full Task Card body in `~/.mira-forge/state.json` as a second requirements database.

## 10. Read and write behavior

Task-source reads MUST be side-effect free.

Repository writes MUST be explicit, workspace-bound, and validated before being treated as successful.

A conforming Forge writer SHOULD:

- preserve unrelated ledger columns and Task Card prose;
- keep ledger title/status and Task Card title/status aligned when explicitly updating either;
- use bounded/atomic file replacement where practical;
- fail on missing, malformed, duplicate, or ambiguous task truth instead of inventing a fallback Task Card.

Autodiscovery of conventional paths is allowed, but discovering a source is not permission to mutate it.

## 11. Compatibility and extensions

The v0.1 parser contract is intentionally tolerant:

- unknown ledger columns are allowed;
- unknown Task Card sections are allowed;
- project-specific statuses are allowed but opaque;
- human prose may evolve without a schema migration.

Extensions MUST NOT change the meaning of the required `ID`, `Task`, or `Status` fields or make Task identity ambiguous.

If Forge later needs machine-readable dependency, ownership, scheduling, or policy metadata, that syntax should be versioned explicitly rather than inferred from arbitrary prose.

## 12. Non-goals

This contract does not define:

- sprint planning;
- estimates or story points;
- assignee/organization models;
- automatic task decomposition;
- external issue synchronization;
- automatic dependency extraction from prose;
- automatic repository status transitions from Builder process events.

Those features may be layered on later without replacing the repository-native task truth defined here.

## 13. Minimal conforming example

`docs/workbench/00-work-ledger.md`:

```md
# Work Ledger

| ID | Task | Status |
| --- | --- | --- |
| APP-001 | Add health endpoint | TODO |
```

`docs/workbench/tasks/APP-001-add-health-endpoint.md`:

```md
# APP-001 — Add health endpoint

Status: TODO

## Goal
Expose a local health endpoint for the application service.

## Acceptance
- `GET /health` returns HTTP 200.
- Existing checks remain green.
```

That is enough to remain pleasant for a human to edit and precise enough for Forge to locate and dispatch without creating a second project-management system.
