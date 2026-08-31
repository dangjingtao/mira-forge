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
| T015 | Main Thread Runtime for Codex and OpenCode | REVIEW | Durable dual-provider thread/task/handoff contracts + Web surface; Verify #93; one harmless real-provider continuation smoke remains |
| T016 | Builder Thread Adapters for OpenCode, PiAgent and Codex | TODO | Depends on T015 PASS; provider-neutral construction-thread adapter expansion |
| T017 | Compact Mira Web UI | TODO | Depends on T015 PASS; Mira accent, compact restrained layout, English-only UI |
| T018 | Live Runtime Surface | TODO | Depends on T016 + T017 PASS; compact live agent/task/session/runtime information |

`PASS` means task acceptance is implemented with repository verification evidence. `REVIEW` means implementation exists but a named acceptance step remains. Human acceptance must be limited to facts that repository automation cannot prove (for example a machine-local binary/provider configuration); users should not be asked to recreate batches, internal IDs, API calls, or concurrency regressions merely to validate Forge.

Fourth-wave execution order: T014 first. After T014 passes, T015 starts. T016 and T017 follow T015; they may run in parallel only after confirming their implementation entry points do not create code or contract contention. T018 integrates the resulting runtime and UI surfaces last.
