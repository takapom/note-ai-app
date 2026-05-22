---
name: ai-native-note-frontend-state-api
description: >-
  AI Native Note frontend の runtime/api-client、server state、draft/focus/loading/error などの ephemeral UI state、backend command mapping、presenter DTO mapping を実装またはレビューするときに使う。
---

# AI Native Note Frontend State And API

## Core rule

Server state is backend-owned and cacheable in the frontend, but never canonical there. Frontend-owned state is temporary interaction state only.

## Required sources

- `docs/contracts/api-events.md`
- `docs/contracts/frontend-ui.md`
- `apps/web/docs/ui-surface-contract.md`
- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

For visual state presentation, also use `$ai-native-note-ui-design`.

## API client boundary

The API client may own:

- HTTP method/path.
- request body construction.
- response parsing.
- stable frontend error meanings.

The API client must not own:

- React state.
- layout decisions.
- domain eligibility rules.
- retries or fallbacks that change product semantics.

Read `references/state-api-checklist.md` before adding API or state code.

## State ownership

Server state examples:

- note document, sections, blocks.
- digest.
- operation proposals.
- memory candidate / review state.
- provenance lookup results.

Ephemeral state examples:

- draft text.
- focused block and selection.
- pending save state.
- inline error state.
- open/closed panels.
- expanded/collapsed digest items.

## Block editing rule

```text
backend block.plainText = canonical
textarea draft = ephemeral
PATCH success = refresh server state or patch cache from backend response
PATCH failure = draft remains dirty and canonical block is not assumed changed
```

## Stop conditions

Stop if code needs to fabricate backend IDs, infer provenance mappings, create fake digest or memory records, or decide that an AI output becomes canonical user-authored content.

