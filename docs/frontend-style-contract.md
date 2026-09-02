# Mira Forge Frontend Style Contract

This document is the source of truth for Forge Web UI styling and frontend visual ownership.

The goal is not to create a design-system product. The goal is to keep a small engineering workbench maintainable as the runtime surface grows.

## 1. Canonical stylesheet entrypoint

`src/styles/index.css` is the only stylesheet imported by the application root.

It imports these files in this order:

1. `tokens.css` — visual primitives and semantic variables;
2. `base.css` — reset, global focus and primitive element behavior;
3. `shell.css` — application frame, top bar, workspace navigation, pane layout and responsive shell;
4. `workbench.css` — project/task/batch/runtime surfaces;
5. `main-thread.css` — Main Thread conversation, process timeline and composer;
6. `overlays.css` — modal, command palette, task picker, first-run acceptance and transient feedback surfaces.

Do not add feature-card or task-card stylesheets such as `T018-*.css`, `*-fix.css`, `visual-override.css`, or `restraint.css`.

A component must not import a second competing stylesheet for rules already owned by the canonical style tree.

`scripts/frontend-style-contract.test.mjs` guards the canonical file set, import order and single TSX stylesheet entrypoint in `npm test`. If the style ownership model intentionally changes, update this contract and the guard together.

## 2. Selector ownership

A selector has one primary owner.

- Shell/layout selectors (`.forge-*`, `.topbar`, `.workspace`, `.sidebar`, `.pane-head`) belong in `shell.css`.
- Task/runtime selectors (`.batch`, `.task-*`, `.event-*`, `.runtime-event`, `.stream-*`) belong in `workbench.css`.
- `.main-thread-*` selectors belong in `main-thread.css`.
- Modal, palette, repository task picker, transient feedback and `.acceptance-*` selectors belong in `overlays.css`.
- Global element rules belong in `base.css`.

Do not solve a visual bug by redefining the same selector later in another file. Move or edit the owning rule instead.

Cross-file grouping is allowed only for genuinely shared primitives such as token values; it must not depend on import-order overrides.

## 3. Tokens before literals

Product and semantic colors come from `tokens.css`.

Canonical semantics:

- Mira / assistant / selected primary action: `--color-accent` (`#FA7328`)
- human conversation identity: `--color-user`
- informational / tool activity: `--color-info`
- thinking / running / warning: `--color-warning`
- success: `--color-success`
- error / destructive: `--color-danger`
- artifact / handoff: `--color-artifact`

Structural chrome should use surface, text and border tokens instead of feature-local hex values.

A literal color is acceptable only for a deliberately one-off derived detail. Repeated literals must become tokens.

The old compatibility aliases (`--mira-accent`, `--line`, `--panel`, `--mono`, etc.) are retired. Do not reintroduce them; use the canonical `--color-*`, `--surface-*`, `--text-*`, `--border-*`, and `--font-*` names. The automated style guard rejects retired aliases.

## 4. Visual hierarchy

Forge is a compact engineering workbench.

- Use density, alignment, typography and semantic state before decorative color.
- Mira orange remains visibly primary but must not replace technical semantic colors.
- Human and assistant turns must be distinguishable before reading their labels.
- Passive separators, panel borders and inactive controls remain neutral.
- Runtime bursts must remain bounded; dynamic data may scroll inside its owned region instead of expanding the whole workbench.
- Important runtime state must remain visible and must not be hidden behind decorative cards or unnecessary modal layers.

### Focus layers

The primary workbench is the operator's current-focus surface, not a dump of every durable runtime record.

- Keep current project/task/batch state and actionable summary visible on the primary surface.
- Secondary inspection data such as full runtime session lists, Main Thread runtime inventory, raw event history and verbose session/result detail should open in explicit keyboard-accessible inspector/modal surfaces.
- A modal may reduce persistent visual noise only when the primary surface retains a truthful summary or attention signal. Do not move unresolved failures/attention completely out of sight.
- Do not repeat one logical object in multiple always-visible regions without an explicit relationship. If task runtime and task state refer to the same task, the inspector must show that relation using authoritative batch/task identity.
- Main Thread conversation remains a first-class rail; runtime inventory may link/focus it, but should not duplicate all Main Thread rows on the default workbench.
- Prefer a shallow interaction path: summary → inspector → selected detail. Avoid nested decorative dialogs or navigation that makes operational state harder to recover.

## 5. Layout and responsive behavior

Current shared breakpoints:

- desktop rail mode: above `1180px`;
- stacked workbench/Main Thread mode: `1180px` and below;
- compact narrow fallback: `760px` and below.

Do not create nearby one-off breakpoints for individual fixes without a clear layout reason.

The Main Thread rail may resize only in desktop rail mode. Its width is local UI preference state, not runtime/project truth.

## 6. Interaction styling

- Keyboard focus must remain visible.
- Hover cannot be the only signal for an actionable control.
- Collapse/expand uses `− / +` for Main Thread.
- Destructive actions use danger semantics; do not use Mira orange as a generic danger color.
- Disabled states must remain recognizable without depending solely on color.
- Inspector/modal entry points must be normal focusable controls so Enter activation works without mouse-only affordances.
- Runtime inspector and event-log overlays must support Escape close; additional shortcuts must be shown where they are available.

## 7. Frontend code ownership

Avoid growing a second kind of override pile in TSX.

- `main.tsx` owns application composition and shell-only UI preference behavior.
- `App.tsx` owns control-plane state, polling, API actions and keyboard orchestration. It should compose view components instead of owning large product markup blocks.
- `src/workbench/` owns control-plane view components and the small shared UI projection model used by those components.
- `RuntimePane.tsx` is the runtime-area composition boundary; substantial runtime sub-surfaces such as batch/task lists, runtime inspection and event streams must have their own component owners instead of growing back into one monolithic pane.
- Runtime projection (`live-runtime-model`) stays separate from presentation. Summary, inspector, selected-row detail and event-log modal should consume that projection rather than derive new runtime truth from display text.
- Modal and command surfaces should remain explicit components rather than returning to conditional JSX blocks inside `App.tsx`.
- `MainThreadPanel.tsx` owns durable conversation behavior, not global shell styling.
- A new substantial UI surface should have one clear component owner and one clear stylesheet owner.
- Do not introduce inline style objects for reusable visual rules; use CSS variables only when runtime values must cross into layout (for example the rail width).

## 8. Change procedure

For a frontend visual change:

1. identify the existing owning stylesheet;
2. add or adjust semantic tokens first if a reusable primitive is missing;
3. edit the owning selector instead of appending an override elsewhere;
4. keep responsive changes beside the owning component/layout rules;
5. run `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`;
6. browser-smoke dynamic states when the change affects polling, runtime bursts, resizing, focus, dispatch/cancel or Main Thread behavior.

If a change appears to require a new task-named stylesheet or duplicate selector, treat that as a signal that ownership needs to be clarified first.

## 9. Review checklist

A frontend PR should be rejected or revised if it:

- creates a task/fix/override stylesheet instead of using the canonical structure;
- redefines an owned selector in a second stylesheet to win by cascade order;
- introduces repeated hard-coded colors instead of semantic tokens;
- adds a new breakpoint without justification;
- hides important runtime state to make the page look cleaner;
- breaks keyboard focus or makes interaction rely on hover alone;
- grows a large existing component for a separable stateful surface without explaining why extraction is worse;
- restores an always-visible wall of runtime/event data when a truthful compact summary plus inspector would preserve focus better.
