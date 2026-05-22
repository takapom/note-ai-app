---
name: ai-native-note-frontend-boundary-review
description: >-
  AI Native Note frontend の実装や差分をレビューし、backend semantics の再実装、backend API 汚染、direct fetch、shared-ui の product 依存、presenter/API/state 境界違反、UI デザイン思想からの逸脱を検出するときに使う。
---

# AI Native Note Frontend Boundary Review

## Review stance

style issue より先に boundary violation を探す。最大の失敗は、frontend code が静かに第二の backend になること。

## Required sources

- `docs/contracts/repository-topology.md`
- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `docs/contracts/api-events.md`
- `apps/web/docs/ui-surface-contract.md`
- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

visual finding には `$ai-native-note-ui-design` も使う。

## Review workflow

1. changed frontend path と各 module owner を特定する。
2. dependency direction と direct import を確認する。
3. component が `runtime/api-client` を使わず backend を直接呼んでいないか確認する。
4. presenter が API call や policy decision を持っていないか確認する。
5. API client が React、UI、layout、retry、domain decision を持っていないか確認する。
6. UI state に invented backend state や fabricated reference がないか確認する。
7. note-first design と AI/user visual distinction に合っているか確認する。
8. findings first で file / line reference 付きで報告する。

具体的な観点は `references/review-checklist.md` を読む。

## Severity guide

- High: frontend が canonical product semantics を mutate / decide する、backend-owned record を捏造する、AI output を local に canonical 化する。
- Medium: dependency direction violation、direct component fetch、API client の React / UI import、presenter の API call、shared-ui の product module import。
- Low: design drift、不明瞭な naming、pending / error / accessibility state 不足、弱い visual distinction。

## Output

severity 順の findings first で返す。その後に residual risks と suggested verification を置く。
