---
name: ai-native-note-frontend-boundary-review
description: >-
  AI Native Note frontend の実装や差分をレビューし、backend semantics の再実装、backend API 汚染、direct fetch、shared-ui の product 依存、presenter/API/state 境界違反、UI デザイン思想からの逸脱を検出するときに使う。
---

# AI Native Note Frontend Boundary Review

## Review stance

Find boundary violations before style issues. The most important failure mode is frontend code silently becoming a second backend.

## Required sources

- `docs/contracts/repository-topology.md`
- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `docs/contracts/api-events.md`
- `apps/web/docs/ui-surface-contract.md`
- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

For visual findings, also use `$ai-native-note-ui-design`.

## Review workflow

1. Identify changed frontend paths and the module owner for each.
2. Check dependency direction and direct imports.
3. Check whether components call backend directly instead of using `runtime/api-client`.
4. Check presenters for API calls or policy decisions.
5. Check API client for React, UI, layout, retries, or domain decisions.
6. Check UI state for invented backend state or fabricated references.
7. Check UI against note-first design and AI/user visual distinction.
8. Report findings first with file/line references.

Read `references/review-checklist.md` for concrete questions.

## Severity guide

- High: frontend mutates or decides canonical product semantics, fabricates backend-owned records, or makes AI output canonical locally.
- Medium: dependency direction violation, direct component fetch, API client imports React/UI, presenter calls API, shared-ui imports product modules.
- Low: design drift, unclear naming, missing pending/error/accessibility state, weak visual distinction.

## Output

Return findings first, ordered by severity, then residual risks and suggested verification.

