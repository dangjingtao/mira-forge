# Mira Forge TUI Interaction Contract

## Purpose

Mira Forge dashboard is a terminal-inspired control surface, not a dark visual skin for a conventional form page. The interface should support a fast, repeatable workflow for inspecting runtime state and registering projects without requiring a mouse.

This document defines the interaction contract for the current TUI direction. It is intentionally limited to dashboard behavior; it does not change the control-plane API or make Forge responsible for launching OpenCode, Codex, or another agent.

## Interaction Model

The screen has four persistent regions:

1. **Top bar** — product identity, current route/context, and local connection state.
2. **Workspace navigator** — selectable project list and project registration entry point.
3. **Runtime stream** — selected project path, aggregate counters, batches, and task rows.
4. **Key bar** — visible reminder of the global keyboard contract.

Transient surfaces are layered over the workspace:

- **Register modal** — creates a project through `POST /api/projects`.
- **Command palette** — exposes global commands and their key bindings.

The selected project is local UI state. Runtime state remains owned by the control plane and is refreshed through `GET /api/state`.

## Keyboard Contract

| Key | Context | Event | Result |
| --- | --- | --- | --- |
| `j` / `ArrowDown` | workspace | `navigate.next` | Move selection to the next project. |
| `k` / `ArrowUp` | workspace | `navigate.previous` | Move selection to the previous project. |
| `Enter` | register modal | `form.submit` | Submit the project registration form. |
| `n` | workspace | `project.register.open` | Open the register-project modal and focus the name field. |
| `/` | workspace | `command.palette.open` | Open the command palette. |
| `r` | workspace | `state.refresh` | Reload durable state from the control plane. |
| `Esc` | any overlay | `overlay.close` | Close the command palette or register modal. |
| `q` | workspace / palette | `overlay.close` | Close an open overlay; no process is terminated. |
| `Tab` / `Shift+Tab` | modal | `focus.next` / `focus.previous` | Move through form controls using native browser focus order. |

Keyboard shortcuts are disabled while an input, textarea, or select has focus, except for `Esc`. This prevents navigation keys from corrupting text entry.

## Event Rules

Events follow these rules:

- Every global command has a visible key hint in the key bar, button, or modal title.
- Every destructive or state-changing operation requires an explicit form submit or command selection; navigation never mutates runtime state.
- `Esc` is always safe and reversible: it closes the topmost transient surface and leaves durable state untouched.
- Refresh is idempotent and only reads `/api/state`.
- Registration closes the modal only after a successful `201` response, then reloads state so the new project appears in the navigator.
- API errors remain visible in the runtime surface and do not clear the current selection.
- Mouse click targets may exist as a convenience, but no workflow depends on them.

## Visual Language

The TUI should read as a workbench rather than a marketing dashboard:

- monospace typography and compact line-oriented rows;
- restrained dark surface with thin separators;
- one selected-row treatment instead of floating card emphasis;
- status color reserved for runtime state, connection state, and errors;
- stable columns for task ID, title, owner, and status;
- no decorative gradients, oversized hero copy, or inert shortcut buttons.

Responsive behavior may stack the navigator above the stream on narrow screens, but it must preserve the same event contract.

## Current Scope

Implemented in the dashboard:

- project navigation with `j/k` and arrow keys;
- keyboard-first project registration modal;
- command palette for registration, refresh, and overlay close;
- visible key bar and focus outlines;
- runtime stream for selected project and existing batch/task state.

Explicitly deferred:

- launching or supervising OpenCode, Codex, Pi Agent, or Claude Code;
- terminal-style task mutation commands;
- command history, fuzzy filtering, and multi-step dispatch workflows;
- adapter-specific controls.

Those capabilities belong behind the provider-neutral adapter and session contracts described in `docs/architecture.md`.

## Verification

The dashboard must continue to pass:

```bash
npm run check
```

For UI acceptance, verify the following against a running development server:

1. `j/k` and arrow keys change the selected project.
2. `n` opens the modal with the name field focused.
3. A registration submitted with `Enter` returns to the workspace and survives refresh.
4. `/` opens the command palette; `Esc` closes it.
5. `r` refreshes state without changing the selected project.
6. `/api/meta`, `/api/adapters`, `/api/sessions`, and `/api/reviews` remain reachable and return JSON.
