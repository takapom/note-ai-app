---
name: domain-primitives-and-always-valid
description: >-
  AI Native Note の値が boundary 内で決して不正になってはいけないときに使う:
  ids、source spans、confidence、context budgets、K limits、content hashes、trigger reasons、operation route options、timestamps、statuses。
---

# Domain primitive と常時 valid

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

不正な primitive を含む domain result を作らない。sentinel value を作る代わりに、result を拒否するか省略する。

## ガードすべき値

- IDs: workspaceId, noteId, sectionId, blockId, structureJobId, operationId。
- Spans: sourceBlockId は non-empty、offset は finite かつ non-negative、end >= start。
- Confidence and thresholds: 0 から 1 の finite number。
- Time: finite timestamp。
- Context limits: finite integer K limits、positive context budget。
- Status and trigger: owner contract 由来の closed enum。
- Hashes: dedupe に使う場合は non-empty content/context hash。

## レビューチェックリスト

- blank string、NaN、Infinity、negative limit、empty object、sentinel value が入り込めるか。
- domain result を構築する前に boundary で validation しているか。
- optional field は blank value として保存せず、省略しているか。
- string は identity や audit field になる前に trim されているか。
- helper は有効な result object だけを返すか。

## このリポジトリで拒否すべき例

- workspace_unset.
- operation_1_NaN.
- sourceSpan: {}.
- negative K limit が Array.slice に流れ込む。
- budget bypass 後でも ContextEnvelope が valid になる。
