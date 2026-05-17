---
name: structure-scheduler
description: Use when implementing note close/tab switch/app leave structuring lifecycle and dirty scope tracking.
---

# Structure Scheduler


Read `docs/contracts/ai-structuring-lifecycle.md`.

Rules:
- BlockChanged saves and marks dirty only.
- No LLM call on every keystroke.
- Primary triggers: note_closed, tab_switched, app_left.
- Recovery trigger: next_open.
- Manual organize is explicit user intent.
- Default target scope: dirty section.
- Whole note scope only for description/manual organize.
