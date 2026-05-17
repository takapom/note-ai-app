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
- AI-generated operation は Operation Router の validation event を通過してから適用される。
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

apps/web emits UI events -> apps/worker route handlers -> Cloudflare Agents -> Operation Router -> Turso。  
generated OpenAPI は projection であり、この契約と live route contracts を上書きしない。

## 移行用の seam

初期 scaffold では exact route naming を変更してよいが、route の意味、event flow、禁止された external action は変更してはならない。

## 削除対象

UI から AI provider、Turso、または Operation Router internal policy を直接呼び出す経路を削除する。

## ガード / 検証

runtime tests は note leave -> job enqueue、next open -> digest、manual organize -> operation generation request の流れを検証しなければならない。
