---
name: domain-model-extractor
description: >-
  既存 docs、contracts、tests、scaffold code から AI Native Note の domain model 候補を抽出するときに使う。
  bounded context、aggregate、不変条件、owner contract、projection、最初の実装 slice を整理する。
---

# ドメインモデル抽出

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

抽出の手がかりを深掘りする場合は references/analysis-heuristics.md を読む。再利用できる report skeleton が必要な場合は references/output-template.md を読む。

## 分析ワークフロー

1. user workflow を特定する: writing、leaving a note、next open、memory review、operation routing。
2. code より先に AGENTS.md と関連する docs/contracts/** を読む。
3. noun、lifecycle state、command、event、不変条件を抽出する。
4. SoT と projection を分離する。
5. すべての不変条件を 1 つの owner contract に割り当てる。
6. 小さくテスト可能な live-contract slice を提案する。

## 出力形式

- bounded context 名。
- owner contract。
- live contract file。
- aggregate/entity/value object 候補。
- 拒否すべき不変条件と invalid state。
- projection surfaces。
- allowed dependencies。
- tests と verification lane。
- non-goals と scope exclusions。

## 抽出時の警告

- domain semantics を DB schema、UI route、generated register、task file から導出しない。
- semantic units を canonical note data として扱わない。
- Note/Scheduler/Context/Operation の言葉で明確に表せるときは、汎用 DDD 例を持ち込まない。
