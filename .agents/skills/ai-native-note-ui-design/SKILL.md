---
name: ai-native-note-ui-design
description: >-
  AI Native Note の frontend UI / UX / visual design を作る、修正する、またはレビューするときに使う。静かな外部脳、統一ノートサーフェス、Note First AI Second、AI 由来 content の識別、provenance、accessibility、frontend が backend semantics を作らないことを守る。
---

# AI Native Note UI Design

## Core thesis

静かな外部脳のための、書くことを中心にした統一ノートサーフェス。

このアプリは AI チャットアプリでも、Notion clone でも、graph-first PKM tool でもない。UI は、ユーザーが書き続け、AI 由来の整理を検査し、採用・編集・保留・削除できるようにするためにある。

## 設計前に読むもの

まず active contract を読む:

- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `apps/web/docs/ui-surface-contract.md`

見た目や interaction の判断が必要な場合は、次の設計思想も読む:

- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md` → `## Design Direction`

短い checklist が必要なら `references/design-principles.md` を読む。

## 設計 workflow

1. 現在の note と編集可能な writing surface を first viewport の主役にする。
2. digest、AI assist、memory candidate、provenance は secondary surface に置く。
3. AI-origin content は user-authored content と視覚的に区別する。色だけに頼らない。
4. writing flow を守る。focus、selection、IME composition、dirty draft、低摩擦な編集を壊さない。
5. loading、pending、failure、empty、unavailable、accepted、dismissed、held を正直に表示する。
6. UI 判断は frontend presenter / component に閉じる。presentation-only のために backend field を要求しない。

## Stop conditions

次の場合は止まり、contract または implementation plan を見直す:

- AI content が canonical user-authored content に見える。
- digest、memory、AI UI が writing を邪魔する。
- mobile layout で note surface が AI UI の背後に隠れる。
- UI が ID、source span、provenance、digest item、memory candidate、related note を捏造する必要がある。
- component が action 可否を判断するために product policy を必要とする。
