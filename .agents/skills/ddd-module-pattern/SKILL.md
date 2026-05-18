---
name: ddd-module-pattern
description: >-
  AI Native Note bounded context の package/module 構造をレビューするときに使う。
  technical folder より、note-model、scheduler、context-assembly、memory、ai-operations、operation-router、runtime など ubiquitous language の context を優先する。
---

# DDD モジュール配置パターン

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

言語別の module layout 例は、タスクが言語をまたぐ package/file placement を求める場合だけ references/language-guides.md を読む。

## リポジトリ固有ルール

module 名は bounded context の言葉と変更理由に一致させる。domain invariant を黙って所有する shared convenience module を作らない。

## このリポジトリで望ましい形

- contexts/note-model/src/contract は document model の semantics を所有する。
- contexts/scheduler/src/contract は structuring lifecycle の semantics を所有する。
- contexts/context-assembly/src/contract は AI context minimization の semantics を所有する。
- contexts/memory/src/contract は memory lifecycle/provenance の semantics を所有する。
- contexts/ai-operations/src/contract は operation schema と routing の semantics を所有する。

## レビューチェックリスト

- module は technical category ではなく domain language で名付けられているか。
- すべての file に 1 つの owner contract があるか。
- generated docs、prompts、Superset tasks は projection として扱われているか。
- shared type が ownership shortcut になっていないか。
- dependency direction は repository-topology.md に合っているか。
- UI/runtime adapters は policy を所有せず contracts を利用しているか。

## 警戒サイン

- shared/types が Note、Memory、Operation、Scheduler の invariant を所有している。
- apps/web が Section semantics を定義している。
- provider や DB に近いという理由で apps/worker が domain policy を定義している。
- requirements draft を直接の実装 authority として参照している。
