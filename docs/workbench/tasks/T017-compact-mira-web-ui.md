# T017 — Compact Mira Web UI

Status: REVIEW

Depends on: T015 PASS.

## Goal

Refine Forge's Web UI into a compact, restrained, information-dense control surface that uses Mira's primary accent color, keeps the main-thread experience visible, and presents all interface copy in English.

The target is not a large "professional-looking" dashboard. The interface should feel precise, calm and efficient at desktop working distance.

## Must Read

- `AGENTS.md`
- `docs/tui-interaction.md`
- `docs/workbench/tasks/T015-main-thread-runtime.md`
- `src/App.tsx`
- `src/styles.css`
- `src/FirstRunCheck.tsx`
- `src/acceptance.css`

## Verified Context

- The keyboard-first control surface is worth preserving.
- The main thread remains a first-class Forge UI, not merely an external OpenCode/Codex interaction.
- Mira's primary color should become the Web UI accent.
- The current visual scale is too coarse for the intended product direction.
- UI copy must be English-only.
- T018 owns richer live-runtime presentation; this task establishes the visual/layout system it will inhabit.

## Scope

1. establish a small set of UI variables/tokens for Mira accent, neutrals, spacing, typography, borders and focus states;
2. reduce oversized headings, cards, paddings, controls and empty space;
3. make project navigation, main thread, task/thread list and runtime areas fit more useful information without visual crowding;
4. preserve keyboard discoverability and visible focus states;
5. keep First-run Check and existing explicit destructive/action confirmations understandable after compaction;
6. ensure all visible product UI strings are English;
7. keep desktop layout polished and provide a reasonable narrow-width fallback without designing a separate mobile product.

Use the repository/current Mira visual source if a canonical primary color is already available at implementation time. Do not guess a new brand color when a real token/source can be read.

## Visual Smoke Follow-up

Human visual smoke found that the compact direction is broadly correct, but the first pass uses the Mira orange too frequently. Refine the surface with Claude Code-style restraint as a reference principle, not as a pixel-for-pixel copy.

- Treat Mira orange as a scarce accent, not the default structural color.
- Keep `#FA7328` for selected/current focus, keyboard focus, a small number of primary/active actions, and occasional high-value emphasis.
- Return ordinary borders, separators, passive icons, secondary buttons, inactive labels and most panel chrome to neutral gray/brown-black tokens.
- Keep semantic states semantic: success green, warning/attention yellow, destructive/error red; do not make every state orange.
- Prefer hierarchy from typography, spacing, alignment and surface contrast before adding accent color.
- Avoid combinations of orange text + orange border + orange background on the same ordinary control.
- Main Thread collapse control should use `−` when expanded and `+` when collapsed. Do not use directional arrows for this action because they read as movement/scroll controls.

The intended result is a mostly neutral engineering workbench with Mira orange used as a precise identity/focus signal.

## Hard Constraints

- Do not remove keyboard-first interaction merely to simplify styling.
- Do not hide important runtime state behind decorative cards or excessive modal layers.
- Do not use large typography/spacing as a substitute for hierarchy.
- Do not add gratuitous animation.
- Do not change task/runtime contracts owned by T014-T016.
- Do not introduce mixed Chinese/English product copy; visible UI is English-only.
- Do not remove the Mira primary color entirely; reduce its coverage and improve its role.

## Execution Entry Points

- `src/App.tsx`
- `src/styles.css`
- `src/main.tsx`
- `src/MainThreadPanel.tsx`
- `src/main-thread.css`
- `src/FirstRunCheck.tsx`
- `src/acceptance.css`
- focused new UI components/styles created by T015

## Acceptance

- Mira primary accent is consistently used for selection, active/focus and important status emphasis without overwhelming the screen.
- Most structural UI is neutral; orange is visibly sparse and intentional rather than repeated across borders, labels and controls.
- Main Thread collapse/expand control uses `− / +` with unambiguous behavior.
- Major page regions are visibly denser than the current implementation: less padding, smaller controls/headings and fewer oversized card surfaces.
- Main thread, project/task/thread navigation and runtime information can coexist on a normal laptop viewport without unnecessary scrolling caused by decorative spacing.
- All visible product UI text is English.
- Keyboard navigation/focus remains usable and visible.
- First-run Check, dispatch and cancel interactions remain understandable and do not regress behavior.
- No major layout jumping is introduced by polling/state changes.
- `npm run typecheck`, `npm run build` and existing smoke verification remain green.

## Delivery Evidence

- Implementation merged to `dev` through PR `#5` — `T017 compact Mira web UI`.
- Mira accent uses the verified current primary `#FA7328` with hover `#E86A21`.
- Main Thread is integrated into the main work surface as a persistent right rail; under `1180px` it becomes an integrated lower region instead of covering the control plane as a floating utility window.
- Existing project/task keyboard interactions, thread actions, dispatch/cancel contracts and provider/runtime APIs were not changed.
- The current `dev` choice to leave the First-run Check launcher entry unmounted is preserved; its dormant UI remains styled and the remaining Chinese diagnostic label was replaced with English.
- GitHub Actions Verify run `33363325558` passed on the final PR head. The job passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.
- Human visual smoke on 2026-08-31 identified two follow-ups before PASS: orange usage is too broad, and Main Thread collapse/expand arrows should become `− / +`.
- Automated verification is complete. T017 remains `REVIEW` until the visual follow-up is implemented and visually accepted.

## Out of Scope

- New runtime event semantics.
- Agent adapter implementation.
- Rich charts/analytics.
- Decorative animation system.
- Mobile app UI.

## Unknown / Human Decision

Resolved for T017: the canonical Mira primary was read from the current Mira visual source and applied as `#FA7328`; no new brand hue was invented.

## Handoff

T017 remains in visual review. Apply the restrained accent-color pass and `− / +` Main Thread collapse control, rerun automated checks, then repeat the short visual smoke. Only after that acceptance should T017 move to PASS and unblock T018.