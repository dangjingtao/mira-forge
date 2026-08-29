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
| T010 | OpenCode local Builder adapter | REVIEW | CLI adapter + JSONL/process tests + fake executable smoke; actual local `opencode` binary acceptance pending |
| T011 | Process supervision and runtime events | PASS | Success/failure/cancel/restart/shutdown supervision tests + dispatch smoke; Verify #51 |
| T012 | TUI dispatch wiring | BLOCKED | Current keyboard-first TUI source is not yet present on remote `dev`; do not implement against stale `src/` |

`PASS` means task acceptance is implemented with repository verification evidence. `REVIEW` means implementation exists but a named acceptance step remains. `BLOCKED` means a required current source or human decision is unavailable. Integration into `dev` / `main` remains a separate decision.
