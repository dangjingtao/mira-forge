# Mira Forge TUI Interaction Contract

## Purpose

Mira Forge dashboard is a terminal-inspired control surface, not a dark visual skin for a conventional form page. The interface supports inspecting runtime state, registering projects, dispatching/cancelling Builder work, and verifying first-run readiness without requiring manual API plumbing.

The dashboard remains a client of the control plane. Provider-specific process behavior stays behind adapters; the TUI never spawns OpenCode directly.

## Interaction Model

The screen has four persistent regions:

1. **Top bar** — product identity, current route/context, and local connection state.
2. **Workspace navigator** — selectable project list and project registration entry point.
3. **Runtime stream** — selected project path, aggregate counters, batches, focusable task rows, Builder busy state, and durable runtime events.
4. **Key bar / first-run affordance** — visible reminders for keyboard commands and the machine-level OpenCode check.

Transient surfaces include Register, Dispatch, Cancel, Command Palette, and First-run Check.

Selected project/task state is local UI state. Runtime state remains owned by the control plane and is refreshed through `GET /api/state`.

## Keyboard Contract

| Key | Context | Event | Result |
| --- | --- | --- | --- |
| `j` / `ArrowDown` | workspace | `navigate.next` | Move selection to the next project. |
| `k` / `ArrowUp` | workspace | `navigate.previous` | Move selection to the previous project. |
| `Tab` / `Shift+Tab` | workspace / modal | `focus.next` / `focus.previous` | Use native browser focus order; focusing a task row selects it locally. |
| `a` | workspace | `acceptance.open` | Open First-run Check. It does not touch a registered project or start until submitted. |
| `d` | workspace / palette | `dispatch.open` | Verify readiness for the selected task and open Dispatch. It does not start a Builder by itself. |
| `x` | workspace / palette | `dispatch.cancel.open` | Open cancellation confirmation for the selected task's active dispatch. |
| `Enter` | form modal | `form.submit` | Submit registration, first-run check, dispatch, or cancellation after the explicit surface is open. |
| `n` | workspace / palette | `project.register.open` | Open register-project and focus the name field. |
| `/` | workspace | `command.palette.open` | Open the command palette. |
| `r` | workspace / palette | `state.refresh` | Reload durable state from the control plane. |
| `Esc` | any overlay | `overlay.close` | Close a non-running overlay without mutating durable state. |
| `q` | workspace / palette | `overlay.close` | Close an open command palette; no process is terminated. |

Keyboard shortcuts are disabled while an input, textarea, or select has focus, except safe overlay handling.

## First-run Check

First-run acceptance must not require the user to manufacture project task truth.

- `a` (or the visible trigger) opens an explicit confirmation surface.
- `POST /api/acceptance/opencode` runs the configured real OpenCode adapter against a disposable system-temp workspace.
- No registered project, Batch or Task is created or modified.
- PASS requires process start, observed `sessionID`, zero exit and verified disposable marker output.
- The workspace is cleaned after success/failure and a bounded timeout terminates a hung check.
- TUI shows PASS/FAIL plus session, exit, marker and duration evidence.

## Event Rules

- Navigation and task focus/selection never mutate runtime state.
- Every state-changing action requires an explicit surface plus submit.
- Dispatch requires authoritative `dispatch-ready` evidence and an explicit task-card reference.
- Cancellation requires a selected active dispatch and confirmation.
- The first-use UI reflects the single-active-Builder policy.
- `Esc` is safe and reversible for non-running overlays.
- Refresh/background polling only read `/api/state`.
- Action errors remain visible across successful background polling; connection errors are tracked separately.
- Runtime events are rendered from durable Forge state; the browser does not manufacture execution evidence.
- Human acceptance is limited to machine-local facts that CI cannot prove. Internal IDs, Batch creation, API calls, state transitions and concurrency regressions belong in automated tests/smokes.

## Visual Language

- monospace typography and compact line-oriented rows;
- restrained dark surface with thin separators;
- one selected-row treatment instead of floating card emphasis;
- status color reserved for runtime state, connection state, acceptance results and errors;
- stable columns for task ID, title, owner/runtime metadata, and status;
- no decorative gradients, oversized hero copy, or inert shortcut buttons.

## Verification

Repository verification remains:

```bash
npm run check
```

Manual acceptance is intentionally small:

1. Press `a` and submit First-run Check once on a machine using the actual local OpenCode installation.
2. Require `PASS`; no project/task setup is needed.
3. Treat the first normal real-project dispatch as observational T012 acceptance instead of manufacturing a fake project task solely for QA.
