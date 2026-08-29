# Mira Forge Work Ledger

| ID | Task | Status | Evidence |
| --- | --- | --- | --- |
| T001 | Bootstrap local control service | PASS | Control-plane smoke + malformed Host survival; Verify #18 |
| T002 | Durable project/batch/task ledger | PASS | Atomic JSON store + persistence/domain tests; Verify #18 |
| T003 | Project registry and runtime API | PASS | Runtime API + review-SHA/batch-ID regression tests; Verify #18 |
| T004 | Minimal global progress dashboard | PASS | React/Vite dashboard + manual register/refresh persistence check; Verify #18 |
| T005 | Adapter registry and heartbeat | DOING | — |
| T006 | Agent session lifecycle | TODO | — |
| T007 | SHA-bound review handoff history | TODO | — |
| T008 | Dispatch readiness and dependency gate | TODO | — |

`PASS` means the task acceptance is implemented and the current `dev` baseline has repository verification evidence. Integration into `main` remains a separate decision.
