---
name: domain-model-first
description: >-
  UI、DB、provider、API adapter より先に、contracts から AI Native Note の domain behavior を実装するときに使う。
  note model、scheduler、context assembly、memory、operations、router boundary の test-first live contract を徹底する。
---

# ドメインモデル優先

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有フロー

1. 1 つの owner contract と 1 つの verification lane を選ぶ。
2. adapter code より先に runtime contract test を書く、または更新する。
3. 最小の pure TypeScript live contract/helper を実装する。
4. invalid state が valid result になれないことを証明する。
5. contract が安定してから runtime、persistence、UI を接続する。

## 最後に扱うもの

- Provider SDK calls。
- Turso migrations/adapters。
- UI rendering details。
- Worker route handlers。

## 必須テストスタイル

- domain words をテストする: BlockChanged、dirty section、ContextEnvelope、MemoryItem、StructureOperation、AuditRecord。
- blank IDs、invalid spans、NaN timestamps、bad thresholds、oversized context、unsafe operations の rejection test を含める。
- app adapters が存在するまでは tests/contracts の近くに tests を置く。

## 停止条件

実装に新しい invariant、trigger、operation type、memory status、MVP scope expansion が必要な場合は停止し、先に owner contract を更新する。
