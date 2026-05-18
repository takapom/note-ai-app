---
name: aggregate-transaction-boundary
description: >-
  1 つの transaction で複数の AI Native Note aggregate または context を更新する、あるいは更新しようとしているタスクで使う:
  note data、structure jobs、context envelopes、memory items、operations、audit records、runtime adapters、Turso persistence。
---

# Aggregate のトランザクション境界

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

1 つの強い一貫性境界が更新する aggregate は 1 つにする。context をまたぐ効果は、job、operation、audit record、event、明示的な adapter boundary として表現する。

## レビューフロー

1. command が変更するすべての aggregate を特定する。
2. 各不変条件を所有する owner contract を特定する。
3. 2 つの aggregate が必ず同時に変わる必要があるなら、本当に別 aggregate なのかを確認する。
4. 別 context なら、eventual consistency、compensation、明示的な recovery を求める。
5. multi-aggregate update を repository や runtime adapter の内部に隠さない。

## AI Native Note 境界

- BlockChanged は blocks の保存と dirty mark までは行ってよいが、AI provider work を直接 enqueue してはいけない。
- StructureJob creation と OperationRouter apply decision は別の lifecycle moment である。
- Memory candidate creation と memory activation は、既定では同じ transaction ではない。
- provider failure が user note editing を rollback してはいけない。
- Turso persistence は複数 record を保存できるが、product consistency は owner contract に従う。

## 必須テスト

- command が無関係な aggregate を直接更新しないことを証明する。
- provider/runtime path の失敗が Note/Block SoT を壊さないことを証明する。
- skipped/deduped jobs が完了済み contextHash work を再実行しないことを証明する。
