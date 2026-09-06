# T014 — Repository-native Task Source Spike

Status: PASS

Base when card was created: `dev@95788258b289268527b9fea7ebbd051b2ff433ee`.

## Goal

Quickly prove that Forge can use a managed repository's Markdown ledger and Task Cards as authoritative task truth without cloning requirement content into Forge runtime state.

This is a spike with a product decision attached: validate the smallest working path first, then expand only if the real path works.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/workbench/00-work-ledger.md`
- `docs/workbench/tasks/README.md`
- `server/domain.mjs`
- `server/store.mjs`
- `server/index.mjs`

## Verified Context

- Managed repositories own requirement/task truth.
- Forge owns runtime orchestration facts such as sessions, dispatches, reviews and events.
- Task Cards are repository-native Markdown contracts, not Jira-style records and not a second Forge database.
- Existing Forge batches/tasks are runtime references and must not silently become a duplicate requirement system.

## Scope

Implement the smallest repository task-source contract needed to:

1. locate the configured ledger/task-card area for a registered project;
2. read a repository ledger and resolve a task ID to its Task Card;
3. return a small normalized task reference needed for Forge execution;
4. create a Task Card and update its repository ledger entry through an explicit operation;
5. keep Task Card body/status authoritative in the managed repository rather than copying the full card into `~/.mira-forge/state.json`.

A thin adapter boundary is preferred, for example a repository Markdown task source, but naming and module shape must follow current code after inspection.

## Hard Constraints

- Do not introduce Jira, Linear, GitHub Issues or another external task platform.
- Do not persist full Task Card content in Forge runtime state.
- Do not silently mutate a managed repository while performing read/inspect operations.
- Writes must be explicit and workspace-bound.
- Do not broaden agent permissions, auto-push, auto-merge or deploy.
- Do not redesign the Web UI in this task.

## Execution Entry Points

- `server/domain.mjs`
- `server/store.mjs`
- `server/index.mjs`
- new focused task-source module(s) and tests if justified

## Acceptance

- A fixture repository with a Markdown ledger and Task Card can be inspected through the task-source contract.
- A task ID resolves to the correct Task Card path and minimal normalized metadata.
- An explicit create/update operation changes repository task truth and can be read back.
- Forge runtime state stores references/bindings only, not a duplicated Task Card body.
- Missing/malformed ledger or task reference returns a bounded, actionable error instead of inventing truth.
- Tests prove read, create/update and no-duplicate-runtime-state behavior.
- Existing `npm run check` remains green.

## Implementation / Evidence

Implemented `server/repo-task-source.mjs` as a focused repository Markdown boundary with four operations:

- `inspectRepositoryTaskSource(project)`
- `resolveRepositoryTask(project, taskId)`
- `createRepositoryTask(project, input)`
- `updateRepositoryTask(project, taskId, patch)`

The adapter requires the registered project to provide repository-relative `taskLedger` and `taskDir` references. It resolves real filesystem paths and rejects configuration or Task Cards that escape the registered project root. Read/inspect paths do not mutate files. Create/update are explicit writes; Task Card and ledger writes use atomic replacement, and create/update includes bounded rollback behavior when the ledger write fails.

The normalized result contains repository references and small index metadata only; full Task Card content is not persisted into Forge runtime state. Ledger/card title or status drift is surfaced as a bounded warning rather than silently choosing invented truth.

`server/repo-task-source.test.mjs` covers source inspection, Task ID resolution, structured create/update, full-content replacement, missing/malformed task truth, workspace-bound path rejection, escaped Markdown-table pipes, and a marker assertion proving Task Card body content is absent from Forge runtime state.

Implementation commit: `16eee54ffd5d255bb3c51abd16eeb85da937f2d1`.

Verify #89 passed `npm test`, `npm run typecheck`, `npm run build` and the existing smoke suite on `dev`.

## Product Decision

The spike validates repository-native Markdown as Forge's default task source. Repository Task Cards/ledger remain project truth; Forge runtime keeps execution bindings only.

T014 intentionally does not add a public task-management HTTP API. T015 should consume this module boundary from the main-thread runtime first. A public API can be added later only if the real product flow needs it.

## Out of Scope

- Main Agent chat/thread runtime.
- Codex/OpenCode/PiAgent adapters beyond what already exists.
- Automatic planning or task decomposition.
- Rich task management UI.
- External issue trackers.

## Unknown / Human Decision

None. The current repository task format supports the minimal common contract without destructive schema assumptions.

## Handoff

T015 is unblocked. Re-read current HEAD before implementation and consume the task-source module rather than duplicating Markdown parsing or Task Card content into thread/runtime state.
