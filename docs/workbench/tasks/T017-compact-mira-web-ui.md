# T017 — Compact Mira Web UI

Status: TODO

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

## Hard Constraints

- Do not remove keyboard-first interaction merely to simplify styling.
- Do not hide important runtime state behind decorative cards or excessive modal layers.
- Do not use large typography/spacing as a substitute for hierarchy.
- Do not add gratuitous animation.
- Do not change task/runtime contracts owned by T014-T016.
- Do not introduce mixed Chinese/English product copy; visible UI is English-only.

## Execution Entry Points

- `src/App.tsx`
- `src/styles.css`
- `src/main.tsx`
- `src/FirstRunCheck.tsx`
- `src/acceptance.css`
- focused new UI components/styles created by T015

## Acceptance

- Mira primary accent is consistently used for selection, active/focus and important status emphasis without overwhelming the screen.
- Major page regions are visibly denser than the current implementation: less padding, smaller controls/headings and fewer oversized card surfaces.
- Main thread, project/task/thread navigation and runtime information can coexist on a normal laptop viewport without unnecessary scrolling caused by decorative spacing.
- All visible product UI text is English.
- Keyboard navigation/focus remains usable and visible.
- First-run Check, dispatch and cancel interactions remain understandable and do not regress behavior.
- No major layout jumping is introduced by polling/state changes.
- `npm run typecheck`, `npm run build` and existing smoke verification remain green.

## Out of Scope

- New runtime event semantics.
- Agent adapter implementation.
- Rich charts/analytics.
- Decorative animation system.
- Mobile app UI.

## Unknown / Human Decision

Canonical Mira primary color must be verified from an existing project/design source before implementation if it is not already present in this repository. Do not substitute an invented hue.

## Handoff

Treat this as product UI refinement, not a dashboard redesign contest. Preserve proven interactions, reduce visual weight and make information hierarchy do the work.