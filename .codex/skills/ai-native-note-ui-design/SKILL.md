---
name: ai-native-note-ui-design
description: >-
  AI Native Note の frontend UI / UX / visual design を作る、修正する、またはレビューするときに使う。静かな外部脳、統一ノートサーフェス、Note First AI Second、AI 由来 content の識別、provenance、accessibility、frontend が backend semantics を作らないことを守る。
---

# AI Native Note UI Design

## Core thesis

静かな外部脳のための、書くことを中心にした統一ノートサーフェス。

The app is not an AI chat app, a Notion clone, or a graph-first PKM tool. The UI exists so the user can keep writing, inspect AI-derived organization, and accept, edit, hold, or remove proposals without losing control.

## Before designing

Read the active contracts first:

- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `apps/web/docs/ui-surface-contract.md`

Then read the design source section when visual or interaction decisions matter:

- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md` → `## Design Direction`

For a compact checklist, read `references/design-principles.md`.

## Design workflow

1. Make the current note and editable writing surface the first-viewport focus.
2. Place digest, AI assist, memory candidates, and provenance as secondary surfaces.
3. Make AI-origin content visually distinct from user-authored content without relying on color alone.
4. Preserve writing flow: focus, selection, IME composition, dirty drafts, and low-friction editing.
5. Show loading, pending, failure, empty, unavailable, accepted, dismissed, and held states honestly.
6. Keep UI decisions in frontend presenters/components; do not request backend fields for presentation-only needs.

## Stop conditions

Stop and revisit the contract or implementation plan if:

- AI content looks canonical user-authored content.
- digest, memory, or AI UI blocks writing.
- mobile layout hides the note surface behind AI UI.
- the UI needs to fabricate IDs, source spans, provenance, digest items, memory candidates, or related notes.
- a component needs product policy to decide whether an action is allowed.

