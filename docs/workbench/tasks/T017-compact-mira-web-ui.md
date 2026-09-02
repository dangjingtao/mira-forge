# T017 — Compact Mira Web UI

Status: PASS

Depends on: T015 PASS.

## Goal

Refine Forge's Web UI into a compact, restrained, information-dense control surface that uses Mira's primary accent color, keeps the main-thread experience visible, and presents all interface copy in English.

The target is not a large "professional-looking" dashboard. The interface should feel precise, calm and efficient at desktop working distance.

## Must Read

- `AGENTS.md`
- `docs/tui-interaction.md`
- `docs/frontend-style-contract.md`
- `docs/workbench/tasks/T015-main-thread-runtime.md`
- `src/App.tsx`
- `src/styles/index.css`
- `src/styles/tokens.css`
- `src/FirstRunCheck.tsx`

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
7. keep desktop layout polished and provide a reasonable narrow-width fallback without designing a separate mobile product;
8. leave the frontend with one explicit style ownership model rather than permanent task/fix override layers.

Use the repository/current Mira visual source if a canonical primary color is already available at implementation time. Do not guess a new brand color when a real token/source can be read.

## Visual Direction Correction

The first pass used too much orange; the subsequent restraint pass then over-corrected and removed too much useful color. The target is a balanced Claude Code / VS Code-inspired engineering palette, not a monochrome neutral UI.

- Mira orange `#FA7328` remains the product's clear primary brand color. It may appear in assistant identity, selected/current focus, keyboard focus, primary actions and a limited number of high-value active states.
- Human and AI conversation turns must be visually distinguishable at a glance without relying only on `USER` / `ASSISTANT` labels. Do not render both roles with the same orange treatment.
- Keep ordinary structural chrome — separators, passive borders, inactive controls and large panel surfaces — mostly neutral so the accent keeps meaning.
- Restore useful VS Code-like technical color variation instead of aliasing every accent-like role to orange. Blue/cyan may represent informational/tool activity; yellow may represent thinking/running/warning; green success; red failure/destructive states; other technical hues may remain where they improve scanning.
- In particular, informational/tool cyan must remain independent from Mira orange.
- Orange should feel like the primary identity color, not the only color in the product.
- Prefer role/state semantics over decorative color. Avoid orange text + orange border + orange background on ordinary controls.
- Main Thread collapse control uses `−` when expanded and `+` when collapsed.

The intended result is a compact engineering workbench with a visible Mira orange identity, clear human/AI role separation, and enough VS Code-like semantic color to scan technical state quickly.

## Main Thread Rail Interaction

Visual smoke also exposed a strong false affordance: the fixed vertical divider beside the Main Thread rail looked draggable before the rail had resize behavior. Because conversation width is a real working preference rather than decoration, the divider is a real horizontal resize handle on desktop.

- The divider between the control surface and Main Thread rail acts as a resize handle on desktop layouts where the rail is on the right.
- Dragging changes the Main Thread rail width continuously without breaking text selection, keyboard focus or active thread state.
- Use sensible minimum and maximum widths so neither the control surface nor conversation pane can be collapsed accidentally into an unusable state.
- Preserve the explicit `− / +` collapse control; resizing and collapsing are separate actions.
- Persist the user's chosen rail width locally across refresh/restart where practical; this is UI preference state, not runtime/task truth.
- At narrow layouts where Main Thread moves below the main surface, horizontal resize behavior is disabled rather than repurposed into a confusing vertical drag interaction.
- The resize handle should provide an appropriate resize cursor and visible hover/focus affordance without becoming a large decorative gutter.

## Top Alignment Follow-up

The first desktop screen initially read as three loosely stacked panes because the left workspace summary, central project header and Main Thread header did not share a consistent top rhythm.

- Align the left workspace section, central project-status section and right Main Thread header to a coherent desktop rhythm.
- `WORKSPACES`, `PROJECT STATUS` and `MAIN THREAD` should follow compatible section-label typography and spacing even though their content differs.
- The current workspace/project summary block and central project header should not appear vertically offset by unrelated padding rules.
- Prefer shared spacing/header tokens or deliberate layout rules over one-off pixel nudges.
- Preserve compact density; alignment must not be achieved by simply making every header taller.
- Narrow responsive layouts may diverge once panes stack, but should still avoid obvious accidental offsets within each stacked region.

The intended result is one coherent engineering workbench rather than three panels that happen to sit beside each other.

## Frontend Maintainability Contract

T017 also owns the cleanup required to keep the accepted visual direction maintainable before T018 adds more runtime UI.

- `docs/frontend-style-contract.md` is the frontend visual/style source of truth.
- `src/styles/index.css` is the only application-root style entrypoint.
- Canonical ownership is `tokens.css`, `base.css`, `shell.css`, `workbench.css`, `main-thread.css`, and `overlays.css`.
- Task/history layers such as `t016-builder-ui.css` and `visual-restraint.css` must not survive as permanent override strata.
- Component-local styles must not duplicate rules already owned by the canonical style tree.
- New visual work edits the owning selector; it must not create a later stylesheet merely to win by cascade order.
- Reusable colors and other visual primitives are semantic tokens. New code should prefer canonical `--color-*`, `--surface-*`, `--text-*`, and `--border-*` variables over compatibility aliases or repeated literals.
- T018 must build on this ownership model rather than adding `T018-*.css`, `*-fix.css`, or equivalent patch layers.

## Hard Constraints

- Do not remove keyboard-first interaction merely to simplify styling.
- Do not hide important runtime state behind decorative cards or excessive modal layers.
- Do not use large typography/spacing as a substitute for hierarchy.
- Do not add gratuitous animation.
- Do not change task/runtime contracts owned by T014-T016.
- Do not introduce mixed Chinese/English product copy; visible UI is English-only.
- Do not remove the Mira primary color entirely or collapse technical semantic colors into one accent.
- Do not implement rail resizing through runtime/project persistence APIs; keep it as local UI preference state.
- Do not add task-named/fix/override stylesheets or duplicate an owned selector in a second stylesheet to force cascade precedence.

## Execution Entry Points

- `src/App.tsx`
- `src/main.tsx`
- `src/MainThreadPanel.tsx`
- `src/FirstRunCheck.tsx`
- `src/styles/index.css`
- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/styles/shell.css`
- `src/styles/workbench.css`
- `src/styles/main-thread.css`
- `src/styles/overlays.css`
- `docs/frontend-style-contract.md`

## Acceptance

- Mira orange is visibly the primary product accent without overwhelming structural chrome.
- Human and AI turns are immediately distinguishable by role styling even before reading the role label.
- Useful technical/semantic color variation remains available: informational/tool, thinking/running/warning, success and error states are not all reduced to orange/gray.
- Most structural UI stays neutral enough that role/state colors remain meaningful.
- Main Thread collapse/expand control uses `− / +` with unambiguous behavior.
- On desktop, the Main Thread rail can be resized horizontally by dragging its divider; the cursor/handle clearly signals this capability.
- Rail resizing has sensible bounds, keeps the rest of the workspace usable, and does not reset selection, focus, draft text or active thread state.
- A chosen desktop rail width is restored after refresh where local UI persistence is available.
- Narrow layouts do not expose a misleading horizontal resize affordance after the Main Thread rail moves below the main surface.
- On the desktop workbench, project navigation, project status and Main Thread read as one coherent surface rather than independently offset panels.
- Major page regions are visibly denser than the original implementation: less padding, smaller controls/headings and fewer oversized card surfaces.
- Main thread, project/task/thread navigation and runtime information can coexist on a normal laptop viewport without unnecessary scrolling caused by decorative spacing.
- Runtime event bursts do not expand the Event Log until it dominates the workbench or visually collapse an active task row.
- All visible product UI text is English.
- Keyboard navigation/focus remains usable and visible.
- First-run Check, dispatch and cancel interactions remain understandable and do not regress behavior.
- No major layout jumping is introduced by polling/state changes.
- The application loads one canonical style entrypoint; task/fix override stylesheets are absent from `src`.
- Frontend selector ownership and token/breakpoint rules are documented and referenced from `AGENTS.md`.
- `npm test`, `npm run typecheck`, `npm run build` and existing smoke verification remain green.

## Delivery Evidence

- Implementation merged to `dev` through PR `#5` — `T017 compact Mira web UI`.
- Mira accent uses the verified current primary `#FA7328` with hover `#E86A21`.
- Main Thread is integrated into the main work surface as a persistent right rail; under `1180px` it becomes an integrated lower region instead of covering the control plane as a floating utility window.
- Existing project/task keyboard interactions, thread actions, dispatch/cancel contracts and provider/runtime APIs were not changed.
- The current `dev` choice to leave the First-run Check launcher entry unmounted is preserved; its dormant UI remains styled and the remaining Chinese diagnostic label was replaced with English.
- GitHub Actions Verify run `33363325558` passed on the final PR head. The job passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.
- Human visual smoke on 2026-08-31 identified two first-pass follow-ups: orange usage was too broad, and Main Thread collapse/expand arrows should become `− / +`.
- Visual restraint follow-up merged to `dev` through PR `#8` at squash commit `c97bfdf597cb7fdc5eb94a85a3829285a0690548`.
- PR `#8` Verify run `33382968808` passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.
- Human browser visual smoke initially accepted the restrained accent pass on 2026-08-31.
- Later visual review on 2026-09-01 superseded that acceptance: the restraint pass was judged too color-sparse, human/AI conversation role separation needs stronger visual distinction, Mira orange should remain a visible primary color, and VS Code-like technical colors should be retained where semantically useful.
- The same visual review identified the fixed Main Thread divider as a false resize affordance; T017 now requires a real bounded desktop drag-resize interaction with local UI preference persistence.
- Follow-up visual review also identified misaligned top-region rhythm across `WORKSPACES`, `PROJECT STATUS` and `MAIN THREAD`; T017 now requires a coherent desktop alignment/rhythm rather than independent pane offsets.
- Rework pass merged to `dev` through PR `#14` at squash commit `71db8a3b4e8f397dbb327209eee12a907574fcdd`.
- PR `#14` implements blue/cyan/yellow/violet technical role/state cues, distinct blue human vs orange assistant turns, real bounded/persistent Main Thread drag resizing with keyboard support, and the shared desktop top rhythm.
- PR `#14` Verify run `33500817912` passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` on final head `ed8978b7b4efd3c8b03089b850522d1c0bf40562`.
- Human dispatch-start smoke on 2026-09-01 exposed a runtime-burst UI regression: repeated `dispatch.provider_event` rows dominated the Event Log and the active task row appeared visually compressed.
- Runtime-burst hardening merged to `dev` through PR `#16` at squash commit `5e398bcc0debcf3cdac853240a296b32ecef44a2`; it bounds the Event Log, keeps its header sticky, shows only the newest low-level provider pulse while preserving lifecycle rows, and hardens active task-row sizing.
- PR `#16` Verify run `33503825474` passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke`.
- Frontend maintainability cleanup merged to `dev` through PR `#18` at squash commit `e9f7cf52e002c98f497d466ae4192e2ed76b9dc2`: historical root/task/visual/component CSS layers were replaced by the canonical `src/styles/` ownership tree, semantic tokens were centralized, and `docs/frontend-style-contract.md` was bound from `AGENTS.md`.
- PR `#18` Verify run `33582718853` passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` on the implementation head. After squash merge, `dev` Verify run `33582823030` passed the same four gates on the merged final tree.
- Follow-up PR `#19` removed the remaining reusable inline `ShortcutFeedback` style object, moved that surface into canonical `overlays.css`, and clarified transient-feedback ownership in the style contract. PR `#19` Verify run `33583025442` passed `npm test`, `npm run typecheck`, `npm run build`, and `npm run smoke` before merge at squash commit `4544f564dcfecf18969abfc958d2411c855c87a9`.
- Final self-audit PR `#20` added executable style-ownership guards, corrected a cross-owner responsive selector and centralized the repeated danger-soft surface token. PR `#20` Verify run `33585496811` passed 94 tests plus typecheck, build and smoke; merged to `dev` at `3606820a654826ea7cf1a746bbb089b48cc31faf`, whose merged-tree Verify `33585561206` also passed all gates.
- Final compatibility-tail PR `#21` retired unused legacy token aliases, extended the guard to prevent their return, and removed repository-task-picker `!important` specificity hacks by scoping rules to their owning overlay. PR `#21` Verify run `33585914016` passed all gates before merge at `f8be2138354caa1aa5e2f553f3fd43f4556cab61`; merged-tree push Verify `33585951385` also passed test, typecheck, build and smoke.
- Component-first cleanup merged to `dev` through PR `#22` at squash commit `445221006b4b62dadbad150542d8f77e4dddebc6`; `App.tsx` was reduced to orchestration/state/API/keyboard responsibilities while workbench view regions and overlays were extracted into explicit `src/workbench/` components. Merged-tree Verify run `33594660837` passed test, typecheck, build and smoke.
- Collapsible workspace rail follow-up merged through PR `#23` at squash commit `4da339bc1bcdd6d648fa599fbfe691d601b0c7c1`: desktop workspace navigation can collapse to a compact text-mark rail, keyboard activation opens basic workspace information, and the preference remains local UI state. The merged tree passed test, typecheck, build and smoke.
- Human browser review accepted T017 on 2026-09-02 after the final componentization and workspace-rail follow-up.

## Out of Scope

- New runtime event semantics.
- Agent adapter implementation.
- Rich charts/analytics.
- Decorative animation system.
- Mobile app UI.

## Unknown / Human Decision

Resolved: Mira orange remains the primary brand color, but it coexists with neutral structural chrome and semantic technical colors rather than replacing them.

Resolved: the right Main Thread divider is a real desktop resize handle rather than visually disguised non-interactive chrome.

Resolved: the desktop top regions should align as one coherent workbench while preserving compact density.

Resolved: frontend style ownership is formalized before T018; future task-specific visual changes must use the canonical style tree instead of permanent override files.

## Handoff

T017 PASS. The compact Forge Web UI, Main Thread rail behavior, runtime-burst hardening, frontend style ownership, component boundaries and collapsible workspace navigation are accepted on `dev`. T018 may proceed without reopening T014-T016 runtime contracts or reintroducing task-specific visual override layers.
