# バックエンドランタイム契約

ドキュメント種別: contract  
権威: backend responsibility boundaries の信頼できる唯一の情報源  
オーナー: runtime オーナー  
付随契約: cloudflare-agents-turso.md, vendor-lock-avoidance.md, api-events.md, data-model.md  
生成済み companion: apps/worker/docs/runtime-contract.md  
検証レーン: runtime topology レビューレーン  
ステータス: active

## 目的

product ownership を runtime code に漏らさず、Worker/API/Agent の責務を定義する。

## この契約が所有するもの


- Worker の責務。
- Runtime adapter boundaries。
- API routing の期待値。
- UI/backend event flow。
- runtime は product semantics を所有しないというルール。


## この契約が所有しないもの


- Note model semantics。
- UI policy。
- AI 操作スキーマ。


## 不変条件


- Worker は HTTP、auth、routing、Turso access、Agent routing、AI SDK provider setup を扱う。
- Worker は contexts/contracts に属する product decisions を直接実装しない。
- Runtime modules は ad-hoc parsing ではなく context contracts と operation router を呼び出す。
- Runtime は `api-events.md` の event flow を実装し、UI event から AI provider または Turso への直接ショートカットを作らない。
- Runtime は note leave、manual organize、next open の API を scheduler/Agents にルーティングする。
- Runtime note structure route handler は route/event normalization、auth/workspace context、runtime port wiring、scheduler runtime flow 呼び出し、response mapping だけを担当し、provider、Operation Router、audit persistence、canonical Note/Block write を所有しない。
- Runtime StructureJob Agent handler は context assembly runtime flow を先に呼び、valid ContextEnvelopeBuilt の場合だけ structure job operation orchestration flow に接続する。invalid context assembly では provider、Operation Router、audit persistence、canonical Note/Block write に到達してはならない。
- Runtime StructureJob work queue port は queued StructureJob の claim と running/completed/failed lifecycle transition だけを扱う application/runtime port である。blank IDs、NaN timestamp、不正 status を valid result として返してはならず、provider、Operation Router、audit persistence、canonical Note/Block write、SQL adapter details を所有しない。
- StructureJob work queue Agent-local SQL adapter は `StructureJobWorkQueuePort` を実装し、`agent_local_structure_jobs` の queued/running/completed/failed temporary state transition だけを扱う。canonical notes / sections / blocks、provider、Operation Router、audit persistence、projection persistence を更新してはならない。
- Runtime StructureJob processor flow は `StructureJobWorkQueuePort.claimNextQueuedJob` を最初に呼び、claimed running job だけを StructureJob Agent handler に渡す。queued job がない場合は no-op として provider、context assembly、Operation Router、audit persistence、complete/fail transition へ進んではならない。
- Runtime StructureJob processor flow は Agent handler が success を返した場合だけ `markJobCompleted` を呼び、completedAt は provider generation flow の completed StructureJob response を使う。context assembly failure、provider failure、invalid generation runtime input、routing failure、audit failure は `markJobFailed` に渡し、routing/audit downstream failure では orchestration result を保持しなければならない。
- Runtime scheduler flow は scheduler contract が返す BlockChanged save/edit/dirty/index output と StructureJob plan を port に渡すだけであり、trigger semantics、context_hash dedupe、whole-note eligibility を再実装してはならない。
- Runtime scheduler flow は invalid scheduler input を persistence port、provider、Operation Router、audit persistence へ流してはならない。
- Scheduler Agent-local SQL adapter は scheduler runtime ports の infrastructure implementation であり、Agent-local temporary state への statement mapping と executor/query failure reporting のみを担当する。canonical Note Model persistence、provider calls、Operation Router、audit persistence を所有しない。
- Turso Scheduler Note Snapshot adapter は `SchedulerNoteSnapshotPort` を実装し、Turso の canonical `sections` を `SectionContract` に mapping する。任意で Agent-local dirty marks を overlay してよいが、canonical Note/Section/Block data の write、scheduler policy の再計算、provider calls、Operation Router、audit persistence を所有しない。
- Runtime context assembly flow は StructureJob target、workspaceId、userId、retrieval port output を Context Assembly contract に渡し、valid ContextEnvelope からのみ user-specific な `ContextEnvelopeBuilt` を返す。retrieval order、K limits、context budget、trust boundary を再実装してはならない。
- Runtime context assembly flow は target snapshot の scope が StructureJob target scope と一致しない場合、local / related / memory retrieval や ContextEnvelope assembly へ進んではならない。
- Context Assembly retrieval ports は read-only application/runtime ports であり、canonical note/section/block snapshots、semantic unit projections、memory projections の取得だけを担当する。canonical Note/Block write、memory status transition、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Target Snapshot adapter は `ContextAssemblyTargetSnapshotPort` を実装し、Turso の canonical `notes`、`sections`、`blocks` を read-only で Context Assembly input candidate へ mapping する。`description_effective` priority、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Local Structure adapter は `ContextAssemblyLocalStructurePort` を実装し、semantic unit projections、section summary projections、previous structure snapshot projections を read-only で Context Assembly input candidate へ mapping する。retrieval order、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Related Context adapter は `ContextAssemblyRelatedContextRetrievalPort` を実装し、related semantic unit projections と explicit candidate relation から canonical note card / block excerpt を read-only で Context Assembly input candidate へ mapping する。full note / full workspace dump、retrieval policy、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Memory Context adapter は `ContextAssemblyMemoryRetrievalPort` を実装し、`memory_context_candidates` と canonical `memory_items` を read-only で Context Assembly input candidate へ mapping する。candidate projection と canonical memory item の両方を workspaceId と userId で境界付け、returned memoryContext item に workspaceId/userId を含めてはならない。memory eligibility の最終 active/pinned filtering、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Runtime operation generation provider flow は valid `ContextEnvelopeBuilt` event、valid ContextEnvelope、running StructureJob だけを provider registry boundary に渡す。Context Assembly の budget / K / trust boundary は再実装せず、provider success の場合だけ completed StructureJob response と provider-independent operations payload を返す。
- Operation generation provider flow は provider SDK import、operation schema/policy validation、Operation Router 呼び出し、audit persistence、canonical Note/Block write を所有しない。provider failure、provider unavailable、invalid runtime input、invalid ContextEnvelope では completed StructureJob response を返さず、Operation Router に到達してはならない。
- Runtime structure job operation orchestration flow は provider generation flow の `completedStructureJobResponse` だけを `structureJobOperationFlow` に渡す。`completedStructureJobResponse.aiResponse` が downstream の Operation Router input になる。
- Runtime structure job operation orchestration flow は provider failure、provider unavailable、invalid generation runtime input、invalid ContextEnvelope では `structureJobOperationFlow` を呼び出さず、Operation Router / audit persistence / Note/Block source of truth に到達してはならない。
- Runtime orchestration boundary は completed StructureJob の AI response だけを operation routing に渡す。non-completed job と provider failure は Note/Block source of truth を変更せず、Operation Router を呼び出さない。
- Runtime は AI response に stable operation audit IDs を付与し、Operation Router を経由してから audit persistence port へ渡す。
- Runtime persistence port は Operation Router の policy/status を再分類せず、storage shape validation と infrastructure error handling のみを担当する。
- Audit persistence failure は routing result と分離され、apply/propose/reject/no_apply decision を書き換えてはならない。
- Runtime operation audit recovery queue は audit persistence failure を retry/recovery 対象として記録する application/runtime port である。queue payload は stable operationId、workspaceId、任意の noteId/structureJobId、元の audit record、failure message、failedAt を保持し、policy/status を再分類してはならない。
- Runtime operation audit recovery queue は retry、transaction、Turso executor 呼び出しを実行しない。retry processor や Agent-local SQL adapter は別の明示的な boundary として追加する。
- Runtime operation projection persistence flow は Operation Router の route result を入力に取り、`apply` action の silent projection effects だけを active projection persistence port へ渡す。`propose` action は operation proposal persistence boundary に渡し、`reject` / `no_apply` は projection write を行わない。
- Operation projection persistence port は routing済み audit record と apply result から作られた write intent だけを保存し、operation schema validation、policy classification、provider call、canonical Note/Section/Block write を所有しない。
- Turso operation audit executor は runtime persistence port の下に置かれる薄い infrastructure executor であり、Turso/libSQL-like client interface に SQL statements を投入するだけである。
- Turso operation audit executor は渡された SQL statement order を保持しなければならない。batching、retry、transaction wrapper を導入する場合も、観測される execution order を変更してはならない。
- Turso operation audit executor は empty statement list を拒否する。これは no-op success ではなく caller misuse / infrastructure failure として扱う。
- Turso operation audit executor は途中 failure を捕捉して policy/status へ変換せず、infrastructure failure として上位へ伝播する。
- 現在の Turso operation audit executor は非トランザクショナルな ordered sequential executor であり、途中 failure 時の partial write 可能性を隠してはならない。all-or-nothing が必要な場合は、runtime persistence/recovery boundary の contract と test を更新してから明示的な transaction/batch adapter として追加する。
- Turso operation audit executor は operation schema、policy classification、routing status を参照しない。これらは Operation Router と audit persistence adapter の責務である。


## 許可されるトポロジー

Web client -> Worker API -> note structure route handler -> Agents / scheduler runtime flow -> StructureJob queue -> structure job processor flow -> StructureJob work queue port -> StructureJob Agent handler -> context assembly runtime flow -> ContextEnvelopeBuilt -> AI Engine / provider registry -> operation generation provider adapter -> structure job operation orchestration flow -> completed StructureJob response -> structure job operation flow -> runtime operation routing adapter -> Operation Router -> audit persistence port -> audit SQL adapter -> Turso operation audit executor -> Turso / operation projection persistence flow -> projection persistence port or proposal persistence port. Audit persistence failure -> operation audit recovery queue port.

## 移行用の seam

一時的な mock providers は test/dev のみで許可される。

## 削除対象

AI runtime adapter の外に散在する provider-specific calls を削除する。

## ガード / 検証

Runtime PRs は contract dependencies を明示し、note structure route handler / scheduler runtime flow / context assembly runtime flow / Agent-local scheduler adapter / StructureJob work queue port / StructureJob processor flow からの provider SDK / Operation Router direct import / audit persistence direct write / canonical Note/Block write、StructureJob processor flow が no queued job で downstream work へ進む path、StructureJob Agent handler が invalid ContextEnvelopeBuilt 前に provider/orchestration へ進む path、operation generation provider flow からの Operation Router / audit persistence call、Operation Router を迂回する direct apply path、non-completed StructureJob からの routing、generated projection 依存、executor での operation schema/policy/status inspection、SQL statement order の破壊、empty statement list の no-op success、partial-write semantics の隠蔽、recovery queue 内での retry/transaction 実行がないことを検証しなければならない。
