---
name: ai-native-note-frontend-state-api
description: >-
  AI Native Note frontend の runtime/api-client、server state、draft/focus/loading/error などの ephemeral UI state、backend command mapping、presenter DTO mapping を実装またはレビューするときに使う。
---

# AI Native Note Frontend State And API

## Core rule

Server state は backend-owned であり、frontend では cache できるが canonical ではない。Frontend-owned state は一時的な interaction state のみ。

## Required sources

- `docs/contracts/api-events.md`
- `docs/contracts/frontend-ui.md`
- `apps/web/docs/ui-surface-contract.md`
- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

visual state の表現には `$ai-native-note-ui-design` も使う。

## API client boundary

API client が持ってよいもの:

- HTTP method / path。
- request body construction。
- response parsing。
- stable frontend error meanings。

API client が持ってはいけないもの:

- React state。
- layout decisions。
- domain eligibility rules。
- product semantics を変える retry / fallback。

API / state code を追加する前に `references/state-api-checklist.md` を読む。

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

backend ID の捏造、provenance mapping の推測、fake digest / memory record の作成、AI output が canonical user-authored content になったという frontend 判断が必要になったら止まる。
