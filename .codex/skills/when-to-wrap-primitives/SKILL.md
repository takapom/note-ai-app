---
name: when-to-wrap-primitives
description: >-
  AI Native Note の primitive value を branded/domain type にするか、boundary validation 付き primitive のままにするかを判断するときに使う:
  IDs、hashes、source spans、budgets、statuses、trigger reasons、confidence、operation types、route options。
---

# Primitive をいつ包むか

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

不正な値が bounded context をまたぐ、または偽の audit/job/envelope を作る場合は primitive を wrap または validate する。すべてを機械的に wrap しない。

## 有力候補

- WorkspaceId, NoteId, SectionId, BlockId, StructureJobId, OperationId.
- SourceSpan.
- Confidence and ConfidenceThreshold.
- ContextHash and ContentHash.
- ContextAssemblyLimits.
- TriggerReason, TargetScope, OperationType, MemoryStatus.

## 判断チェックリスト

- non-empty/range/enum/order invariant があるか。
- same-type argument を取り違えやすいか。
- この値は audit、job、memory、envelope record に保存されるか。
- この値は context をまたぐか。
- invalid value が sentinel fallback を強制するか。

## 現段階の指針

この scaffold では、branded type を導入する前に runtime validation helper を使ってよい。invalid primitive が繰り返し出るなら、owner context 内で value object または branded type に昇格させる。
