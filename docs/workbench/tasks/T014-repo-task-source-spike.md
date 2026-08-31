# T014 — Repository-native Task Source Spike

Status: TODO

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

## Out of Scope

- Main Agent chat/thread runtime.
- Codex/OpenCode/PiAgent adapters beyond what already exists.
- Automatic planning or task decomposition.
- Rich task management UI.
- External issue trackers.

## Unknown / Human Decision

None for the spike. If current repository task formats cannot support a minimal common contract without destructive assumptions, stop and report the concrete conflict rather than designing a large schema.

## Handoff

Read the current repository and tests before editing. If current code contradicts this card, current repository facts win; report the conflict before widening scope.