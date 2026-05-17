# Cloudflare Agents と Turso Runtime 契約

ドキュメント種別: contract  
権威: Cloudflare/Turso architecture の信頼できる唯一の情報源  
オーナー: runtime infrastructure オーナー  
付随契約: backend-runtime.md, ai-structuring-lifecycle.md, data-model.md, api-events.md  
生成済み companion: apps/worker/docs/runtime-contract.md  
検証レーン: scaffold 後の runtime integration tests  
ステータス: active

## 目的

Cloudflare Agents、Workers、AI SDK、Turso の state placement と runtime topology を定義する。

## この契約が所有するもの


- canonical DB としての Turso。
- temporary state/job/session buffer としての Agent-local SQL。
- NoteAgent と WorkspaceBrainAgent の roles。
- ActionAgent は future-only であるという境界。
- Cloudflare Agents 内で Turso Sync を使わないこと。


## この契約が所有しないもの


- Product memory semantics。
- UI behavior。
- Specific model provider。


## 不変条件


- Turso は notes、blocks、sections、semantic_units、semantic_edges、memory_items、ai_operations、source_spans の canonical persistence である。
- Cloudflare Agent-local SQL は edit buffers、current session、dirty section tracking、pending jobs、retry queues、local transient logs のみを保存する。
- Cloudflare runtime では Turso Sync ではなく Turso serverless access を使用する。
- NoteAgent は edit event buffer、dirty section tracking、note leave handling、structure job scheduling、context_hash dedupe を扱う。
- WorkspaceBrainAgent は related context retrieval、memory candidate management、workspace-wide semantic graph coordination を扱う。
- ActionAgent は external action candidate、approval、retry/outbox のための将来候補であり、MVP runtime には入れない。
- Agent-local SQL と Turso は自動 Sync しない。


## 許可されるトポロジー

Worker -> NoteAgent/WorkspaceBrainAgent -> Turso + AI SDK. Agent-local SQL は canonical ではない。

## 移行用の seam

Mock local persistence は初期 UI fixtures のためにのみ許可される。

## 削除対象

Agent-local SQL を canonical note storage として扱う code をすべて削除する。

## ガード / 検証

Runtime review は canonical-data violations、Agent-local SQL の逸脱、Turso Sync の混入を確認する。
