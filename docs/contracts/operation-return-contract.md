# AI 操作返却契約

ドキュメント種別: contract  
権威: AI operation shape と application policy の信頼できる唯一の情報源  
オーナー: ai-operations context オーナー  
付随契約: context-assembly.md, memory.md, security-privacy.md  
生成済み companion: contexts/ai-operations/src/contract/operationContract.ts  
検証レーン: operation schema + router tests  
ステータス: active

## 目的

AI に free-form structural output ではなく safe operations を返させる。

## この契約が所有するもの


- Operation taxonomy。
- Source span requirement。
- Confidence requirement。
- Policy classification: silent, inline, review, blocked.
- Operation Router audit ID の所有境界。
- AI は user text を直接 rewrite できないというルール。


## この契約が所有しないもの


- required constraints を超える Prompt wording details。
- UI rendering details。
- Persistence storage mechanics。


## 不変条件


- AI responses は operation lists である。
- MVP で許可する operation は `create_semantic_unit`, `create_relation`, `create_memory_candidate`, `insert_assist_block`, `mark_stale`, `no_op` である。
- MVP で禁止する operation は `rewrite_user_block`, `send_external_message`, `create_external_event`, `delete_user_block`, `modify_user_block_without_review` である。
- Visible または memory-affecting operations には source spans が必要である。
- Relevant operations には confidence が必要である。
- Low confidence operation は適用しない、または `no_op` にする。
- Unknown operation types は拒否される。
- User-authored blocks は AI によって直接 rewrite されてはならない。
- 操作ルーター は AI operation を DB/UI に直接適用させず、schema、source spans、confidence threshold、target existence、policy decision、ai_operations record、safe apply、unsafe rejection を担当する。
- 安定した operation audit ID は runtime/application boundary が routing 前に `operationId` または operation list 用の `operationIds` として供給する。
- 操作ルーター は operation audit ID を生成しない。blank、invalid、sentinel、または operation list と対応しない ID は routing 前の boundary violation として拒否される。
- `ai_operations.id` は routing へ供給された operation audit ID と一致し、audit source span の `targetId` も同じ ID を参照する。
- Policy は `silent`, `inline`, `review`, `blocked` のいずれかである。


## 許可されるトポロジー

AI Engine / provider registry -> operation generation provider -> structure job operation orchestration flow -> completed StructureJob response -> structure job operation flow -> runtime operation routing adapter -> 操作ルーター -> semantic units / メモリ候補 / assist blocks / logs.

## 移行用の seam

Free-form AI text は `insert_assist_block.content` 内でのみ許可され、authoritative structure としては決して扱わない。

## 削除対象

direct model-output-to-DB application paths を削除する。

## ガード / 検証

すべての operation path は accept/reject/no-op のテストを持たなければならない。
