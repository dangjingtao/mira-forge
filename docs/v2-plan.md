# Mira Forge V2 Plan

**Planning snapshot:** 2026-08-29
**Baseline:** `dev` at `0fb8a60`
**V1 status:** implementation complete; human acceptance in progress.

## Planning Rule

New work stays in V1 only when it closes an existing V1 acceptance criterion or fixes a correctness defect in an already-implemented V1 contract.

New work belongs in V2 when it introduces a new orchestration capability, expands provider scope, changes concurrency/integration policy, or creates a new client boundary. V2 must not be used to hide unfinished V1 acceptance.

## V1 Carry-over, Not V2

These are still V1 acceptance items:

- Run the `a` First-run Check with the actual local `opencode` installation and require `PASS`.
- Observe the first normal real-project dispatch through the TUI.
- Confirm selection stability, explicit dispatch, runtime evidence, and review-stage landing.
- Fix defects discovered in the existing Core/API/TUI contracts.

T010 and T012 remain `REVIEW` until these facts are observed. They are not new V2 scope.

## V2 Themes

### V2.1 Reviewer execution

Goal: close the Builder-to-Reviewer loop without making Review PASS implicit.

- Reviewer adapter contract and first concrete Reviewer implementation.
- Automatic or operator-triggered review handoff after successful Builder completion.
- Reuse the existing exact-SHA review invariant.
- Durable review prompts, bounded review evidence, and failure/timeout handling.
- TUI review status, handoff visibility, and explicit operator override boundaries.

Out of scope for this theme: automatic merge and unreviewed integration.

### V2.2 Git and integration workflow

Goal: make integration an explicit, observable operation after review.

- Git adapter with repository status and branch/SHA observation.
- Explicit integration readiness and operator confirmation.
- Integration attempt records and runtime events.
- Conflict and dirty-working-tree reporting.
- Preserve the rule that Review PASS is necessary evidence, not an automatic merge command.

Out of scope for this theme: auto-push production, auto-deploy, and silent conflict resolution.

### V2.3 Scheduler, worktrees, and parallel construction

Goal: safely move beyond the first-use single-Builder policy.

- Scheduler policy for multiple ready tasks.
- Per-dispatch worktree or equivalent isolation contract.
- Adapter capacity and resource claims.
- Parallel Builder execution with deterministic integration ordering.
- Recovery behavior for abandoned worktrees and interrupted dispatches.

This theme must be designed before enabling parallel dispatch. Parallel construction must not imply parallel integration.

### V2.4 Reliability and recovery

Goal: improve long-running operation without claiming crash-proof supervision prematurely.

- Retry policy with durable attempt lineage.
- Resume/reattach where a provider supports it.
- More explicit timeout and cancellation policy.
- State repair/reconciliation diagnostics.
- Retention and bounded compaction for runtime events and execution evidence.

### V2.5 Task truth ingestion

Goal: reference managed-project task truth without creating a competing requirement system.

- Read-only task-ledger discovery and ingestion adapters.
- Mapping from project task references to Forge runtime bindings.
- Detect missing, changed, or ambiguous task references.
- Keep the managed repository authoritative for requirements and product status.

No feature in this theme should silently clone a second editable task system into Forge.

### V2.6 TUI operator workflows

Goal: make the keyboard-first client efficient for repeated operational use.

- Search and filtering for projects, batches, tasks, and runtime events.
- Command history and contextual command palette filtering.
- Better focus model for long task/event streams.
- Review, Git, scheduler, and recovery views as Core-backed presentations.
- Optional standalone terminal client only after the API/event contracts are stable.

The TUI remains presentation and interaction. Business rules stay in Forge Core.

### V2.7 Additional adapters

Goal: add provider diversity behind the existing adapter boundary.

- Codex adapter.
- Claude Code adapter.
- Pi Agent or other local/external execution adapters.
- Capability negotiation and provider-specific evidence normalization.

Each adapter must preserve the Core invariants and must not require a provider process to be alive for durable state to remain valid.

### V2.8 Mira integration

Goal: allow Mira to use Forge as an execution/delegation layer while keeping boundaries explicit.

- Mira Thread as the long-lived user context.
- Forge Run as one concrete delegated work execution.
- Agent Session as a provider-specific execution context.
- Explicit status/result events from Forge back to Mira.
- Authorization and project policy boundaries.

This theme is intentionally last in the sequence. It should consume stable Forge contracts rather than drive a premature Core rewrite.

## Proposed Sequence

```text
V1 close
  -> V2.1 Reviewer execution
  -> V2.2 Git and integration workflow
  -> V2.3 Scheduler/worktrees/parallel construction
  -> V2.4 Reliability and recovery
  -> V2.5 Task truth ingestion
  -> V2.6 TUI operator workflows
  -> V2.7 Additional adapters
  -> V2.8 Mira integration
```

The sequence is a planning default, not an irreversible contract. A theme may be split into task cards after its acceptance boundary is agreed.

## V2 Non-goals

V2 does not automatically imply:

- auto-merge;
- production auto-push;
- deployment;
- permission bypass;
- a second requirement/task database;
- hidden provider-specific behavior in Core;
- replacing the existing Web client with a TUI-only product.

## Discussion Queue

Before creating V2 task cards, each proposed feature should answer:

1. Which Core contract or API does it extend?
2. What durable evidence does it add?
3. What remains operator-confirmed?
4. What is the failure/recovery behavior?
5. Why is it not a V1 acceptance fix?

Until those answers exist, the item remains a discussion entry here rather than implementation work.
