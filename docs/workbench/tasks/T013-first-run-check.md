# T013 — One-step First-run Check

Status: PASS

## Goal

Make machine-level OpenCode acceptance a one-step Forge operation instead of asking the user to create test projects, inspect internal IDs, call runtime APIs or manufacture fake task truth.

## Acceptance

- `a` or the visible `first-run check` trigger opens an explicit confirmation surface.
- The check uses the configured real OpenCode runner but creates its workspace under the system temp directory, not under any registered project.
- It creates no Forge Project, Batch or Task and leaves managed repository truth untouched.
- It verifies process start, first observed OpenCode `sessionID`, normal exit and an exact marker file created inside the disposable workspace.
- The disposable workspace is removed after success or failure.
- A bounded timeout terminates a hung check and reports failure.
- PASS/FAIL plus session, exit, marker and duration evidence are shown in the TUI.
- CI can run the same HTTP path with the fake OpenCode executable.

## Evidence

Implemented in `server/acceptance.mjs`, `src/FirstRunCheck.tsx` and `src/acceptance.css`, exposed as `POST /api/acceptance/opencode`.

Unit tests cover success, missing session binding and timeout/termination. `dispatch-smoke.mjs` calls the acceptance endpoint through the real server process using the fake executable and verifies complete evidence. Verify #63 passed test, typecheck, build and smoke on `dev`.

## Acceptance policy established

Human acceptance is reserved for facts repository automation cannot establish, such as a user's actual local binary/provider configuration. Internal API setup, runtime IDs, state-machine transitions, cancellation races and regression cases belong in automated verification rather than a manual checklist.
