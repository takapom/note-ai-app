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
- Runtime scheduler flow は scheduler contract が返す BlockChanged save/edit/dirty/index output と StructureJob plan を port に渡すだけであり、trigger semantics、context_hash dedupe、whole-note eligibility を再実装してはならない。
- Runtime scheduler flow は invalid scheduler input を persistence port、provider、Operation Router、audit persistence へ流してはならない。
- Scheduler Agent-local SQL adapter は scheduler runtime ports の infrastructure implementation であり、Agent-local temporary state への statement mapping と executor/query failure reporting のみを担当する。canonical Note Model persistence、provider calls、Operation Router、audit persistence を所有しない。
- Turso Scheduler Note Snapshot adapter は `SchedulerNoteSnapshotPort` を実装し、Turso の canonical `sections` を `SectionContract` に mapping する。任意で Agent-local dirty marks を overlay してよいが、canonical Note/Section/Block data の write、scheduler policy の再計算、provider calls、Operation Router、audit persistence を所有しない。
- Runtime context assembly flow は StructureJob target と retrieval port output を Context Assembly contract に渡し、valid ContextEnvelope からのみ `ContextEnvelopeBuilt` を返す。retrieval order、K limits、context budget、trust boundary を再実装してはならない。
- Runtime context assembly flow は target snapshot の scope が StructureJob target scope と一致しない場合、local / related / memory retrieval や ContextEnvelope assembly へ進んではならない。
- Context Assembly retrieval ports は read-only application/runtime ports であり、canonical note/section/block snapshots、semantic unit projections、memory projections の取得だけを担当する。canonical Note/Block write、memory status transition、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Target Snapshot adapter は `ContextAssemblyTargetSnapshotPort` を実装し、Turso の canonical `notes`、`sections`、`blocks` を read-only で Context Assembly input candidate へ mapping する。`description_effective` priority、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Runtime orchestration boundary は completed StructureJob の AI response だけを operation routing に渡す。non-completed job と provider failure は Note/Block source of truth を変更せず、Operation Router を呼び出さない。
- Runtime は AI response に stable operation audit IDs を付与し、Operation Router を経由してから audit persistence port へ渡す。
- Runtime persistence port は Operation Router の policy/status を再分類せず、storage shape validation と infrastructure error handling のみを担当する。
- Audit persistence failure は routing result と分離され、apply/propose/reject/no_apply decision を書き換えてはならない。
- Runtime operation audit recovery queue は audit persistence failure を retry/recovery 対象として記録する application/runtime port である。queue payload は stable operationId、workspaceId、任意の noteId/structureJobId、元の audit record、failure message、failedAt を保持し、policy/status を再分類してはならない。
- Runtime operation audit recovery queue は retry、transaction、Turso executor 呼び出しを実行しない。retry processor や Agent-local SQL adapter は別の明示的な boundary として追加する。
- Turso operation audit executor は runtime persistence port の下に置かれる薄い infrastructure executor であり、Turso/libSQL-like client interface に SQL statements を投入するだけである。
- Turso operation audit executor は渡された SQL statement order を保持しなければならない。batching、retry、transaction wrapper を導入する場合も、観測される execution order を変更してはならない。
- Turso operation audit executor は empty statement list を拒否する。これは no-op success ではなく caller misuse / infrastructure failure として扱う。
- Turso operation audit executor は途中 failure を捕捉して policy/status へ変換せず、infrastructure failure として上位へ伝播する。
- 現在の Turso operation audit executor は非トランザクショナルな ordered sequential executor であり、途中 failure 時の partial write 可能性を隠してはならない。all-or-nothing が必要な場合は、runtime persistence/recovery boundary の contract と test を更新してから明示的な transaction/batch adapter として追加する。
- Turso operation audit executor は operation schema、policy classification、routing status を参照しない。これらは Operation Router と audit persistence adapter の責務である。


## 許可されるトポロジー

Web client -> Worker API -> Agents -> scheduler runtime flow -> StructureJob queue -> context assembly runtime flow -> ContextEnvelopeBuilt -> AI SDK provider adapter -> completed StructureJob response -> runtime operation routing adapter -> Operation Router -> audit persistence port -> audit SQL adapter -> Turso operation audit executor -> Turso. Audit persistence failure -> operation audit recovery queue port.

## 移行用の seam

一時的な mock providers は test/dev のみで許可される。

## 削除対象

AI runtime adapter の外に散在する provider-specific calls を削除する。

## ガード / 検証

Runtime PRs は contract dependencies を明示し、scheduler/context assembly runtime flow / Agent-local scheduler adapter からの provider / Operation Router / audit persistence call、Operation Router を迂回する direct apply path、non-completed StructureJob からの routing、generated projection 依存、executor での operation schema/policy/status inspection、SQL statement order の破壊、empty statement list の no-op success、partial-write semantics の隠蔽、recovery queue 内での retry/transaction 実行がないことを検証しなければならない。
