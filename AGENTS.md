# Mira Forge Agent Contract

Mira Forge is a local engineering orchestrator, not a coding agent and not a project-management replacement.

## Branches

- `main`: stable baseline.
- `dev`: active development and integration.
- Short-lived task branches/worktrees may be created from `dev` later.

## V1 boundaries

1. The global control service is the runtime source of truth for batches, sessions and review handoff.
2. Persistent runtime state belongs outside managed projects, under `~/.mira-forge/` by default.
3. Managed repositories keep their own requirement/task truth. Forge may reference task files but must not silently clone them into a second requirement system.
4. Builder, reviewer and Git integrations must be adapters. Core state must not depend on OpenCode, Codex or Vite being alive.
5. A review result must bind to a concrete SHA before later automation can treat it as valid.
6. Parallel construction does not imply parallel integration.
7. V1 must not auto-merge, auto-push production, deploy, or broaden agent permissions without explicit project/user policy.

## Engineering rules

- Node 22+.
- Prefer Node built-ins in the control plane until a dependency is justified.
- Keep API contracts small and explicit.
- Add tests for persistence and state transitions before expanding automation.
- Frontend visual changes must follow `docs/frontend-style-contract.md`; do not add task-named/fix/override stylesheets or duplicate owned selectors to win by cascade order.
- Do not claim PASS until verification evidence exists.
