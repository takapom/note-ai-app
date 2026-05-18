# API とイベント契約

ドキュメント種別: contract  
権威: MVP API surface と domain event flow の信頼できる唯一の情報源  
オーナー: runtime オーナー  
付随契約: backend-runtime.md, cloudflare-agents-turso.md, ai-structuring-lifecycle.md, operation-return-contract.md  
生成済み companion: apps/workspace-api/generated/openapi.json  
検証レーン: runtime lane + operation lane  
ステータス: active

## 目的

UI、Worker、Agents、Operation Router が、暗黙の副作用ではなく明示的な event と API によって接続されるようにする。

## この契約が所有するもの

- MVP UI events。
- MVP backend events。
- MVP HTTP API の概念的 surface。
- API route の実装時に contract 化すべき境界。

## この契約が所有しないもの

- 認証 provider の具体実装。
- exact OpenAPI schema の生成形式。
- UI component state。
- database migration syntax。

## 不変条件

- UI events は `BlockChanged`, `NoteClosed`, `TabSwitched`, `AppLeft`, `NextOpen`, `ManualOrganizeRequested`, `AssistBlockAccepted`, `AssistBlockDismissed`, `MemoryCandidateAccepted`, `MemoryCandidateRejected` を含む。
- Backend events は `DirtySectionMarked`, `StructureJobEnqueued`, `ContextEnvelopeBuilt`, `OperationsGenerated`, `OperationValidated`, `OperationApplied`, `OperationRejected`, `DigestPrepared` を含む。
- `BlockChanged` は保存、edit event 記録、dirty scope marking のみを行い、LLM を呼ばない。
- note leave 系 API は structure job enqueue までを担い、AI output を直接 UI/DB に適用しない。
- Worker scheduler runtime flow は `BlockChanged` を scheduler contract に渡し、valid な save/edit/dirty/index output だけを persistence port へ渡す。invalid input では persistence、provider、Operation Router、audit persistence を呼び出してはならない。
- Worker scheduler runtime flow は `note_closed` / `tab_switched` / `app_left` / `next_open` / `manual_organize` を scheduler contract に渡し、planned StructureJob の enqueue と `next_open` digest preparation までを扱う。provider call、Operation Router、audit persistence はこの slice の外である。
- Worker context assembly runtime flow は StructureJob の target と userId を Context Assembly contract / retrieval ports に渡し、retrieval ports から target snapshot、local structure、related context、user-scoped memory candidates を取得する。
- Worker context assembly runtime flow は target snapshot の scope が StructureJob target scope と一致する場合にのみ ContextEnvelope assembly へ進む。
- `ContextEnvelopeBuilt` は valid ContextEnvelope からのみ発生する。retrieval failure、invalid envelope、budget violation では provider、Operation Router、audit persistence を呼び出してはならない。
- AI Engine / provider registry boundary は `ContextEnvelopeBuilt`、valid ContextEnvelope、running StructureJob を受け取り、provider success のときだけ completed StructureJob response と provider-independent operations payload を返す。この event は Operation Router や audit persistence を呼ばない。Structure job operation orchestration flow は provider success の completed response だけを runtime operation routing adapter に渡し、provider failure / unavailable / invalid input では停止する。
- AI-generated operation は Operation Router の validation event を通過してから適用される。
- `OperationsGenerated` は completed StructureJob、valid ContextEnvelope、provider success の後にのみ発生する。non-completed job と provider failure は `OperationsGenerated`、`OperationValidated`、`OperationApplied`、`OperationRejected` を発生させない。
- `OperationsGenerated` 後の runtime structure job operation orchestration flow は provider generation flow の `completedStructureJobResponse.aiResponse` を `structureJobOperationFlow` に渡す。provider failure、provider unavailable、invalid generation runtime input、invalid ContextEnvelope は `OperationValidated`、`OperationApplied`、`OperationRejected`、audit persistence を発生させない。
- `OperationsGenerated` 後の runtime flow は stable operation audit IDs を付与し、Operation Router の routing result と audit persistence result を分離して扱う。
- Audit persistence failure は routing decision を書き換えず、retry/recovery 対象の runtime failure として扱う。
- Audit persistence failure が発生した runtime flow は、operation audit recovery queue port が渡されている場合、stable operationId、workspaceId、任意の noteId/structureJobId、元の audit record、failure message、failedAt を enqueue する。recovery enqueue failure も routing decision を書き換えてはならない。
- Memory accept/reject API は memory status を変更し、source/provenance を削除しない。
- External action API は MVP には存在しない。

## MVP API surface

- `GET /notes`
- `POST /notes`
- `GET /notes/:noteId`
- `PATCH /notes/:noteId`
- `POST /notes/:noteId/blocks`
- `PATCH /blocks/:blockId`
- `DELETE /blocks/:blockId`
- `POST /notes/:noteId/leave`
- `POST /notes/:noteId/structure/manual`
- `GET /notes/:noteId/digest`
- `POST /ai-operations/:operationId/accept`
- `POST /ai-operations/:operationId/dismiss`
- `POST /memory/:memoryId/accept`
- `POST /memory/:memoryId/reject`

## 許可されるトポロジー

apps/web emits UI events -> apps/worker route handlers -> Cloudflare Agents -> scheduler runtime flow -> StructureJob queue -> context assembly runtime flow -> ContextEnvelopeBuilt -> AI Engine / provider registry -> operation generation provider adapter -> structure job operation orchestration flow -> completed StructureJob response / OperationsGenerated -> structure job operation flow -> runtime operation routing adapter -> Operation Router -> audit persistence port -> Turso。audit persistence failure -> operation audit recovery queue port。
generated OpenAPI は projection であり、この契約と live route contracts を上書きしない。

## 移行用の seam

初期 scaffold では exact route naming を変更してよいが、route の意味、event flow、禁止された external action は変更してはならない。

## 削除対象

UI から AI provider、Turso、または Operation Router internal policy を直接呼び出す経路を削除する。

## ガード / 検証

runtime tests は BlockChanged -> save/edit/dirty/index persistence、note leave -> job enqueue、next open -> digest、manual organize -> StructureJob enqueue、completed StructureJob job processing -> operation generation request、context assembly runtime flow -> ContextEnvelopeBuilt、ContextEnvelopeBuilt -> provider registry -> structure job operation orchestration flow -> completed StructureJob response、completed StructureJob AI response -> structure job operation flow -> Operation Router -> audit persistence port の流れ、audit persistence failure -> recovery queue port の流れ、および note structure route handler / scheduler/context assembly runtime flow が provider / Operation Router / audit persistence を呼ばないこと、StructureJob Agent handler が invalid context assembly で provider / Operation Router / audit persistence を呼ばないこと、operation generation provider flow が Operation Router / audit persistence / Note/Block write を呼ばないこと、structure job operation orchestration flow が provider failure / unavailable / invalid input を routing へ渡さないこと、non-completed job / provider failure が routing されないことを検証しなければならない。
