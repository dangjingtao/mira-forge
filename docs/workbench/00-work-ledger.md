# Mira Forge Work Ledger

| ID | Task | Status | Evidence |
| --- | --- | --- | --- |
| T001 | Bootstrap local control service | PASS | Control-plane smoke + malformed Host survival; Verify #18 |
| T002 | Durable project/batch/task ledger | PASS | Atomic JSON store + persistence/domain tests; Verify #18 |
| T003 | Project registry and runtime API | PASS | Runtime API + review-SHA/batch-ID regression tests; Verify #18 |
| T004 | Minimal global progress dashboard | PASS | React/Vite dashboard + manual register/refresh persistence check; Verify #18 |
| T005 | Adapter registry and heartbeat | PASS | Provider-neutral registry + heartbeat + legacy-state compatibility; Verify #25 |
| T006 | Agent session lifecycle | PASS | Durable role-bound session lifecycle + transition/API smoke; Verify #26 |
| T007 | SHA-bound review handoff history | PASS | Durable review history + round/SHA anti-forgery + invalidation; Verify #31 |
| T008 | Dispatch readiness and dependency gate | PASS | Dependency validation + active-session gate + readiness API smoke; Verify #28 |
| T009 | Dispatch request and durable attempt | PASS | Serialized readiness gate + durable dispatch/event evidence + duplicate/serial dispatch tests; Verify #51 |
| T010 | OpenCode local Builder adapter | PASS | Actual local First-run Check passed on 2026-08-31: session observed, exit 0, marker verified |
| T011 | Process supervision and runtime events | PASS | Success/failure/cancel/restart/shutdown supervision tests + dispatch smoke; Verify #51 |
| T012 | TUI dispatch wiring | REVIEW | Keyboard dispatch/cancel/runtime UI verified in repository; first normal real-project dispatch will close observational acceptance |
| T013 | One-step First-run Check | PASS | Disposable real-OpenCode diagnostic + API/UI + timeout/session/marker tests + fake-OpenCode E2E; Verify #63 |
| T014 | Repository-native Task Source Spike | PASS | Repo Markdown inspect/resolve/create/update, workspace bounds, no runtime Task Card copy; Verify #89 |
| T015 | Main Thread Runtime for Codex and OpenCode | PASS | Reopened after wrong-root Mobile task-source evidence was invalidated; shared main-thread/Batch defaults fixed; durable `mira-mobile` binding corrected; 34 `MOB-*` tasks verified through live APIs and new OpenCode thread `MT-bdfcb6a6-0dd`; 90 tests + typecheck + build green on 2026-09-01 |
| T016 | Builder Thread Adapters for OpenCode, PiAgent and Codex | PASS | Human Mac product-loop smoke accepted on 2026-09-02: `mira-mobile` root/task source preflight passed; exact `MOB-031` card resolved; Codex Builder dispatched from Forge UI with real external session, 79 runtime events and `dispatch.completed` exit 0; runtime task reached durable `reviewing` after browser refresh. Conditional follow-up: readable Builder final-result handoff into Main Thread is assigned to T018, not treated as an adapter failure |
| T017 | Compact Mira Web UI | PASS | Human browser review accepted on 2026-09-02 after canonical style ownership cleanup, componentization and collapsible workspace-rail follow-up; merged-tree test/typecheck/build/smoke remained green |
| T018 | Live Runtime Surface | REVIEW | PR #24 delivered the live runtime surface/result handoff; self-acceptance PR #25 fixed provider-context delivery, standalone result rendering, truthful startedAt timing, resolved historical attention and attention retention. Both PR and merged-tree Verify pass test/typecheck/build/smoke. One real Builder dispatch remains as the task-card-required final observational smoke |

`PASS` means task acceptance is implemented with repository verification evidence and any required machine-local/product-loop observation has actually been completed. `REVIEW` means implementation exists but a named acceptance step remains. Human acceptance must be limited to facts that repository automation cannot prove (for example a machine-local binary/provider configuration or a real end-to-end product interaction); users should not be asked to recreate batches, internal IDs, API calls, or concurrency regressions merely to validate Forge.

Fourth-wave execution order: T014 first, then T015. T015, T016 and T017 are PASS. T018 implementation is in REVIEW pending only its named real-Builder final observational smoke; repository automation covers provider-context result delivery, state mapping, identity correlation, idempotency, polling row stability and regression gates.
