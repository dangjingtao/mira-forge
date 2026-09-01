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
| T016 | Builder Thread Adapters for OpenCode, PiAgent and Codex | REVIEW | Shared Builder contract + deterministic adapter/dispatch verification (Verify #157, PR #6); PR #9 merged repo Task Source → Batch UI, authoritative taskRef resolution and OpenCode/PiAgent/Codex Builder selector; final PR-head Verify #181 green. Remaining acceptance: one human Mac Forge UI → real PiAgent/Codex execution → runtime evidence → durable task `reviewing` loop + refresh replay |
| T017 | Compact Mira Web UI | TODO | Unblocked by T015 PASS; Mira accent, compact restrained layout, English-only UI; T015 smoke UI findings belong here |
| T018 | Live Runtime Surface | TODO | Depends on T016 + T017 PASS; compact live agent/task/session/runtime information |

`PASS` means task acceptance is implemented with repository verification evidence and any required machine-local/product-loop observation has actually been completed. `REVIEW` means implementation exists but a named acceptance step remains. Human acceptance must be limited to facts that repository automation cannot prove (for example a machine-local binary/provider configuration or a real end-to-end product interaction); users should not be asked to recreate batches, internal IDs, API calls, or concurrency regressions merely to validate Forge.

Fourth-wave execution order: T014 first, then T015. With T015 now PASS, T016 and T017 are unblocked and may run in parallel after confirming their implementation entry points do not create code or contract contention. T018 remains blocked until both T016 and T017 are PASS.
