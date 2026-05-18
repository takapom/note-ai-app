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
- Worker scheduler runtime flow は NoteAgent / runtime ports を通じて BlockChanged persistence、dirty tracking、StructureJob queue、next_open digest preparation を調整するが、AI provider、Operation Router、audit persistence を呼び出さない。
- Scheduler Agent-local SQL adapter は BlockChanged save intent / edit event / dirty mark / lightweight index update、StructureJob queue、next_open digest intent を temporary state として保存する。canonical notes / sections / blocks を更新する Turso adapter ではない。
- Turso Scheduler Note Snapshot adapter は Worker scheduler runtime flow から `SchedulerNoteSnapshotPort` として呼ばれ、Turso canonical sections を read-only で取得する。Agent-local dirty_scope_marks は scheduler planning のための一時 overlay であり、canonical section data でも Turso Sync でもない。
- WorkspaceBrainAgent は related context retrieval、memory candidate management、workspace-wide semantic graph coordination を扱う。
- ActionAgent は external action candidate、approval、retry/outbox のための将来候補であり、MVP runtime には入れない。
- Agent-local SQL と Turso は自動 Sync しない。
- AI operation audit persistence は runtime の port を通じて Turso に書き込む。SQL adapter は `ai_operations` と `source_spans` への mapping と infrastructure error handling のみを担当し、operation policy を再分類しない。
- Operation audit recovery queue は audit persistence failure の retry/recovery intent を runtime/application port として記録する。MVP runtime では retry queue は Agent-local SQL に置いてよいが、canonical audit record は Turso の `ai_operations` / `source_spans` である。
- Scheduler Agent-local SQL adapter は scheduler contract が作った output を statement に変換するだけであり、trigger policy、context_hash dedupe、whole-note eligibility を再実装しない。
- Turso operation audit executor は、上流の audit persistence adapter が作った SQL statement list を Turso/libSQL-like client に順番どおり渡す薄い infrastructure executor である。
- Turso operation audit executor は empty statement list を infrastructure misuse として拒否し、Turso client を呼び出してはならない。
- Turso operation audit executor は途中の statement failure を infrastructure failure として上位へ伝播する。失敗時に routing decision、operation status、policy classification を書き換えてはならない。
- 現在の Turso operation audit executor は ordered sequential executor であり、すでに Turso client が受理した statement の rollback を約束しない。partial write recovery、retry、または all-or-nothing transaction wrapper は executor の内側に暗黙化せず、runtime persistence/recovery boundary の明示的な責務として扱う。
- Turso operation audit executor は operation schema、policy/status semantics、`ai_operations` / `source_spans` の field-level 意味を解釈しない。schema-aware mapping は executor の上流 adapter の責務である。


## 許可されるトポロジー

Worker -> NoteAgent/WorkspaceBrainAgent -> scheduler runtime flow -> SchedulerNoteSnapshotPort -> Turso canonical sections + optional Agent-local dirty_scope_marks overlay -> StructureJob queue -> completed StructureJob response -> Operation Router -> audit persistence port -> schema-aware audit SQL adapter -> Turso operation audit executor -> Turso + AI SDK. Audit persistence failure -> operation audit recovery queue port -> Agent-local SQL retry queue. Agent-local SQL は canonical ではない。

## 移行用の seam

Mock local persistence は初期 UI fixtures のためにのみ許可される。

## 削除対象

Agent-local SQL を canonical note storage として扱う code をすべて削除する。

## ガード / 検証

Runtime review は canonical-data violations、Agent-local SQL の逸脱、Turso Sync の混入、Operation Router を迂回した audit/application path、executor が statement order を変更する実装、empty statement list を許す実装、executor が operation policy/schema を読む実装、partial-write semantics を隠す transaction/retry 実装を確認する。
