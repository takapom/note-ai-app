---
name: frontend-note-surface
description: Use when implementing web UI components for Unified Note Surface, AI Assist Blocks, Next Open Digest, or Provenance Popover.
---

# Frontend Note Surface


Read `docs/contracts/frontend-ui.md` and `docs/contracts/unified-note-surface.md`.

Rules:
- AI Assist Blocks render inside the note surface.
- No persistent AI chat panel.
- No AI mode switcher in MVP.
- UI must not interrupt writing flow.
- AI blocks are editable, dismissible, and inspectable.
- Source provenance uses popover or inline disclosure, not a permanent separate layer.
