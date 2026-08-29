# Mira Forge TUI Interaction Contract

## Purpose

Mira Forge dashboard is a terminal-inspired control surface, not a dark visual skin for a conventional form page. The interface supports a fast, repeatable workflow for inspecting runtime state, registering projects, and explicitly dispatching or cancelling Builder work without requiring a mouse.

The dashboard remains a client of the control plane. Provider-specific process behavior stays behind adapters; the TUI does not call OpenCode directly.

## Interaction Model

The screen has four persistent regions:

1. **Top bar** — product identity, current route/context, and local connection state.
2. **Workspace navigator** — selectable project list and project registration entry point.
3. **Runtime stream** — selected project path, aggregate counters, batches, focusable task rows, Builder busy state, and durable runtime events.
4. **Key bar** — visible reminder of the global keyboard contract.

Transient surfaces are layered over the workspace:

- **Register modal** — creates a project through `POST /api/projects`.
- **Dispatch modal** — confirms the selected task, task-card reference and optional OpenCode model/agent before `POST .../dispatch`.
- **Cancel modal** — confirms termination of the selected active dispatch before `POST .../cancel`.
- **Command palette** — exposes global commands and their key bindings.

Selected project/task state is local UI state. Runtime state remains owned by the control plane and is refreshed through `GET /api/state`.

## Keyboard Contract

| Key | Context | Event | Result |
| --- | --- | --- | --- |
| `j` / `ArrowDown` | workspace | `navigate.next` | Move selection to the next project. |
| `k` / `ArrowUp` | workspace | `navigate.previous` | Move selection to the previous project. |
| `Tab` / `Shift+Tab` | workspace / modal | `focus.next` / `focus.previous` | Use native browser focus order; focusing a task row selects it locally. |
| `d` | workspace / palette | `dispatch.open` | For the selected task, verify readiness and open the dispatch confirmation form. It does not start a Builder by itself. |
| `x` | workspace / palette | `dispatch.cancel.open` | Open cancellation confirmation for the selected task's active dispatch. It does not kill the process by itself. |
| `Enter` | form modal | `form.submit` | Submit registration, dispatch, or cancellation after the user has opened the corresponding modal. |
| `n` | workspace / palette | `project.register.open` | Open the register-project modal and focus the name field. |
| `/` | workspace | `command.palette.open` | Open the command palette. |
| `r` | workspace / palette | `state.refresh` | Reload durable state from the control plane. |
| `Esc` | any overlay | `overlay.close` | Close the topmost overlay without mutating durable state. |
| `q` | workspace / palette | `overlay.close` | Close an open command palette; no process is terminated. |

Keyboard shortcuts are disabled while an input, textarea, or select has focus, except for `Esc`. This prevents command keys from corrupting text entry.

## Event Rules

Events follow these rules:

- Every global command has a visible key hint in the key bar, button, or modal title.
- Navigation and task focus/selection never mutate runtime state.
- Dispatch requires a selected task, authoritative `GET /api/batches/:batchId/dispatch-ready` readiness, an explicit dispatch surface, and form submission.
- The dispatch form requires a task-card reference. Optional OpenCode model/agent values are explicit operator choices rather than inferred project truth.
- Cancellation requires a selected active dispatch and a separate confirmation submit before Forge sends termination to the supervised child.
- The first-use UI reflects the single-active-Builder policy. While `opencode-local` is active, another task is not presented as concurrently dispatchable.
- `Esc` is always safe and reversible: it closes transient surfaces and leaves durable state untouched.
- Refresh and background polling only read `/api/state`.
- Registration closes only after a successful `201` response, then reloads state.
- Action errors remain visible across successful background polling and do not clear project/task selection. Connection errors are tracked separately.
- Runtime events are rendered from durable Forge state; the browser does not manufacture queued/running/completed evidence.
- Mouse click targets exist as a convenience, but dispatch/cancel workflows remain keyboard-reachable.

## Visual Language

The TUI should read as a workbench rather than a marketing dashboard:

- monospace typography and compact line-oriented rows;
- restrained dark surface with thin separators;
- one selected-row treatment instead of floating card emphasis;
- status color reserved for runtime state, connection state, and errors;
- stable columns for task ID, title, owner/runtime metadata, and status;
- no decorative gradients, oversized hero copy, or inert shortcut buttons.

Responsive behavior may stack the navigator above the stream on narrow screens, but it must preserve the same event contract.

## Current Scope

Implemented in the dashboard:

- project navigation with `j/k` and arrow keys;
- keyboard-first project registration modal;
- focusable/selectable runtime task rows;
- `d` dispatch and `x` cancel surfaces plus command-palette equivalents;
- visible first-use serial Builder ownership;
- durable dispatch event log;
- persistent action errors separated from connection state;
- visible key bar and focus outlines.

Explicitly deferred:

- automatic Reviewer dispatch;
- parallel scheduler/worktree controls;
- task-ledger ingestion/import UI;
- command history and fuzzy filtering;
- provider-specific controls beyond the first local OpenCode Builder path.

## Verification

The dashboard must continue to pass:

```bash
npm run check
```

For UI acceptance, verify the following against a running development server:

1. `j/k` and arrow keys change the selected project.
2. `n` opens the registration modal with the name field focused.
3. `Tab` can focus a task row without mutating runtime state.
4. With a ready task selected, `d` opens Dispatch but does not start work until the form is submitted.
5. Dispatch requires a task-card reference and then produces durable queued/started/session-bound/terminal evidence.
6. While `opencode-local` is active, the UI shows the owning task and does not offer a second concurrent Builder dispatch.
7. With an active selected dispatch, `x` opens cancellation confirmation; cancelling produces durable cancelled/interrupted evidence.
8. A dispatch/readiness error stays visible through the next background poll and selection remains intact.
9. `/` exposes the same dispatch/cancel commands; `Esc` closes overlays safely.
10. `/api/meta`, `/api/adapters`, `/api/sessions`, `/api/reviews`, `/api/dispatches`, and `/api/events` remain reachable and return JSON.
