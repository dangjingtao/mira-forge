# T015 — Main Thread Runtime for Codex and OpenCode

Status: TODO

Depends on: T014 PASS.

## Goal

Add Forge's first real product entry: a durable main/dispatch thread that can run with Codex or OpenCode, understand the selected project, create/update repository Task Cards through the task-source contract, and hand an approved task to Forge dispatch.

The main thread is not a Builder. Its job is to discuss, inspect, plan, create Task Cards and decide when to dispatch.

## Must Read

- `AGENTS.md`
- `docs/architecture.md`
- `docs/workbench/tasks/T014-repo-task-source-spike.md`
- `server/domain.mjs`
- `server/index.mjs`
- `server/opencode-adapter.mjs`
- `src/App.tsx`

## Verified Context

- Forge should remain usable through a persistent main thread UI; it is not only a background API for another agent product.
- Main/dispatch threads must support both Codex and OpenCode.
- Repository Task Cards are project truth. Main threads may create or update them explicitly, but Forge must not invent a second task-management system.
- Existing durable session/dispatch/review state should be reused rather than replaced.

## Scope

Define and implement the smallest provider-neutral thread runtime needed for:

1. create/open a main thread for a registered project;
2. select `codex` or `opencode` as the main-thread adapter;
3. send user messages and receive durable normalized thread events;
4. let the main thread inspect project/task context through explicit Forge capabilities;
5. create/update a repository Task Card via T014's task-source boundary;
6. produce an explicit dispatch handoff referencing `project + taskId + taskRef + preferredBuilder`;
7. expose the thread in the Web/TUI surface well enough to continue the conversation.

Prefer a small normalized event contract such as message/tool/status/artifact/handoff events. Provider-specific details may remain optional rather than forcing false uniformity.

## Hard Constraints

- Do not turn the main thread into a Builder process.
- Do not copy full Task Card truth into runtime state.
- Do not auto-dispatch merely because a Task Card was created; dispatch remains an explicit action/handoff.
- Do not auto-push, merge, deploy or broaden permissions.
- Do not require Codex/OpenCode feature parity beyond the minimal thread contract.
- Keep provider-specific behavior behind adapters.

## Execution Entry Points

- `server/domain.mjs`
- `server/index.mjs`
- existing adapter/session modules
- new thread-domain/runtime modules and tests
- `src/App.tsx` or focused new thread UI components

## Acceptance

- A registered project can open a durable main thread using either Codex or OpenCode.
- User message -> agent response works through the normalized thread contract for both adapters, with bounded provider-specific metadata.
- Thread history survives UI refresh/control-plane restart where the underlying provider contract permits durable replay.
- The main thread can create one repository Task Card through the T014 task source and read it back.
- A dispatch handoff references the repository Task Card rather than duplicating its body.
- No dispatch occurs without an explicit user/agent action.
- Thread events are testable without requiring a real provider in CI; real-provider acceptance is limited to a small machine-level check.
- `npm run check` remains green.

## Out of Scope

- PiAgent as a main/dispatch thread provider for this phase.
- Reviewer automation loop.
- Parallel Builder scheduling/worktrees.
- Full provider-specific tool rendering fidelity.
- Large visual redesign; T017 owns that.

## Unknown / Human Decision

If Codex lacks a stable local thread/session interface that can satisfy the minimum contract, implement the adapter boundary and the narrowest proven path, then report the exact unsupported capability rather than simulating it.

## Handoff

Re-read current HEAD and provider interfaces before implementation. Keep the normalized contract small; optional provider features must not leak into Forge core.