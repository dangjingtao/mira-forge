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

`PASS` means task acceptance is implemented with repository verification evidence. `REVIEW` means implementation exists but a named acceptance step remains. Human acceptance must be limited to facts that repository automation cannot prove (for example a machine-local binary/provider configuration); users should not be asked to recreate batches, internal IDs, API calls, or concurrency regressions merely to validate Forge.
