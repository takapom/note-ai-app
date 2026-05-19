# Backend DDD Hardening Issues - 2026-05-19

ドキュメント種別: record / issue drafts
権威:
- `docs/contracts/backend-runtime.md`
- `docs/contracts/repository-topology.md`
- `docs/contracts/cloudflare-agents-turso.md`
- `docs/contracts/data-model.md`
- `docs/contracts/api-events.md`
- `docs/contracts/verification-lanes.md`

オーナー: Codex review
ステータス: active

## 目的

UI 実装 / polish に入る前に、backend runtime、persistence readiness、Agent queue、failure recovery、curl / smoke lane、architecture guard を DDD の bounded context と責務分割に沿って固定する。

GitHub issue 作成はこの sandbox では `gh` が policy により拒否されるため、この record を issue draft の source として残す。GitHub 操作が可能な環境では、以下の issue draft をそのまま issue に転記する。

## 共通制約

- `contexts/**` は domain invariant / policy owner であり、`apps/worker` / `apps/web` を import しない。
- `apps/worker` は runtime adapter / orchestration boundary であり、DB や Provider に近いことを理由に domain policy を所有しない。
- `apps/web` は UI projection / interaction owner であり、Worker internals、provider、auth provider、canonical SoT mutation を所有しない。
- Turso canonical persistence と Agent-local temporary state を混同しない。
- AI は user-authored Block / Section SoT を直接書き換えない。
- generated OpenAPI、GitHub issue、PR、runbook は projection であり、契約 SoT ではない。
- `AGENTS.md` は unrelated local change があるため、この issue 群では触らない。

## 実装順序

| ID | Issue | Blocking | 並列化 |
| --- | --- | --- | --- |
| BAH-01 | Architecture: bounded context import/source guard baseline | yes | 最初に実施 |
| BAH-02 | Persistence: canonical Turso migration readiness | yes | BAH-03 と並列可 |
| BAH-03 | Persistence: Agent-local SQL readiness | yes | BAH-02 と並列可 |
| BAH-04 | Agent / queue runtime hardening | yes | BAH-03 後 |
| BAH-05 | Error / recovery boundary hardening | yes | BAH-03 後、BAH-04 と一部並列可 |
| BAH-06 | Backend runtime smoke / curl lane | yes | BAH-02 / BAH-03 後、最終統合 |
| BAH-07 | Backend readiness review before UI | yes | BAH-04 / BAH-05 / BAH-06 後 |

## Implementation Status

| ID | Status | Evidence |
| --- | --- | --- |
| BAH-01 | completed | `tests/contracts/topology-runtime.test.mjs` と `tests/contracts/web-note-surface-integration-guard.test.mjs` に architecture boundary baseline を追加。`node --test tests/contracts/topology-runtime.test.mjs tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs` と `tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-02 | completed | `tests/contracts/worker-schema-readiness.test.mjs` と `tests/fixtures/worker-canonical-schema-fixture.mjs` で canonical Turso schema readiness を追加。canonical adapter focused tests と `tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-03 | completed | `tests/contracts/worker-agent-local-schema-readiness.test.mjs` と `tests/fixtures/worker-agent-local-schema-fixture.mjs` で Agent-local SQL readiness を追加。Agent-local adapter focused tests と `tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-04 | completed | `WorkspaceBrainAgent.processNextQueuedStructureJob` を injected processor options 経由で runtime processor flow に接続。`node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs tests/contracts/worker-structure-job-processor-flow.test.mjs`、Agent-local work queue focused test、no direct SoT mutation guard、`tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-05 | completed | stable failure meaning、Agent-local operation audit recovery SQL adapter、HTTP error response guard を追加。`node --test tests/contracts/worker-operation-routing-flow.test.mjs tests/contracts/worker-operation-audit-recovery-agent-local-sql-adapter.test.mjs tests/contracts/worker-operation-projection-persistence-flow.test.mjs tests/contracts/worker-http-error-responses.test.mjs`、no direct SoT mutation guard、`tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-06 | completed | `tests/contracts/backend-runtime-smoke.test.mjs` で Worker fetch boundary を curl-like に検証。note/block/structure/digest/provenance/memory/operation routes、invalid JSON/auth/route/method/missing port、canonical-vs-Agent-local ledger separation を確認。`node --test tests/contracts/backend-runtime-smoke.test.mjs`、Worker entrypoint/router focused tests、hosted E2E、`tsc -p tsconfig.json --noEmit` が pass。 |
| BAH-07 | completed | 親レビューと独立 review subagent で BAH-01〜06 の DDD / bounded context / responsibility を確認。WorkspaceBrain deployable processor wiring と DO/RPC volatile error leak の blocking finding を修正後、再レビューで blocking finding なし。`node --test --test-reporter=dot tests/**/*.test.mjs`、`tsc -p tsconfig.json --noEmit`、contract lint、doc register check、`git diff --check` が pass。 |

## Subagent Assignment Model

- BAH-01: architecture guard 専任。実装変更は guard / record に限定する。
- BAH-02: canonical Turso schema readiness 専任。Agent-local temporary state を扱わない。
- BAH-03: Agent-local SQL readiness 専任。canonical Note / Section / Block tables を扱わない。
- BAH-04: Agent / StructureJob runtime 専任。Context Assembly / Operation Router policy を変更しない。
- BAH-05: failure meaning / recovery boundary 専任。routing decision と recovery status を混ぜない。
- BAH-06: smoke / curl lane 専任。backend route behavior の到達性を確認し、UI 実装に触れない。
- BAH-07: parent reviewer が実施。全 issue の結果を統合し、blocking finding がなくなるまで修正を回す。

## Issue Drafts

### Issue BAH-01: Architecture: bounded context import/source guard baseline

目的:
UI polish 前に `apps/worker` / `apps/web` / `contexts/**` の禁止依存を固定し、以後の backend hardening が DDD 境界を壊していないことを検出できるようにする。

コンテキスト:
`contexts/**` が invariant owner、`apps/worker` は runtime adapter、`apps/web` は UI/application surface。先に guard baseline を張ることで、後続の persistence / Agent / smoke 実装で責務が漏れた場合にすぐ検出できる。

制約:
- `apps/worker` は Note / Memory / Scheduler / Operation Router policy を所有しない。
- `apps/web` は backend provider/auth/SoT mutation を持たない。
- generated OpenAPI は projection であり、route semantics の SoT にしない。
- 便利な shared package に invariant を逃がさない。

実装メモ:
- 既存の `topology-runtime.test.mjs`、`worker-no-direct-sot-mutation-guard.test.mjs`、Web integration guard を拡張する。
- guard examples:
  - `contexts/**` does not import `apps/**`
  - `apps/web/src/**` does not import `apps/worker/**`
  - Web does not import provider SDK / auth provider / generated OpenAPI for policy
  - Worker route / entrypoint modules do not import Operation Router internals except allowed runtime flow boundary
  - SQL adapters stay infrastructure mapping only
- 既存 behavior と contract が矛盾した場合、実装変更ではなく finding として報告する。

完了条件:
- forbidden import、direct SoT mutation、provider shortcut、generated projection authority が test で検出可能。
- 後続 issue の実装担当が参照できる guard baseline がある。
- `docs/contracts/verification-lanes.md` に architecture guard lane が不足していれば追記されている。

検証コマンド:
- `node --test tests/contracts/topology-runtime.test.mjs tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `tests/contracts/topology-runtime.test.mjs`
- `tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `tests/contracts/web-note-surface-integration-guard.test.mjs`
- `docs/contracts/verification-lanes.md`
- `docs/records/ADR-0004-bounded-context-map.md` if status update is needed

サブエージェント注意点:
- guard 追加で contract と矛盾したら、勝手に implementation を寄せず、blocking finding として返す。
- 後続 issue の実装範囲を先取りしない。

### Issue BAH-02: Persistence: canonical Turso migration readiness

目的:
Turso canonical persistence の schema expectations を、adapter tests だけでなく schema fixture / migration readiness として固定する。

コンテキスト:
Note document persistence、memory review、operation proposals、provenance lookup、operation audit adapters は実装済み。`docs/contracts/data-model.md` が logical data model の SoT であり、SQL fixture / migration は infrastructure projection。

制約:
- Turso は canonical persistence。Agent-local temporary state と混ぜない。
- SQL adapter は mapping と infrastructure error のみを扱い、domain invariant を再分類しない。
- schema readiness は DB schema に domain policy を押し込むためではなく、adapter が期待する table / column / nullability / key shape の drift を検出するために置く。
- dual-read / dual-write compatibility bridge を作らない。

実装メモ:
- schema fixture または migration smoke を追加する。
- canonical expected tables:
  - `notes`
  - `sections`
  - `blocks`
  - `memory_items`
  - `operation_proposals`
  - `ai_operations`
  - `source_spans`
  - Context Assembly / semantic unit read model tables, if currently implemented
- adapter が参照する required columns を検査する。
- duplicate audit ID rejection や required field guard は adapter behavior として focused tests で固定する。
- actual production migration runner の選定はこの issue の範囲外。必要になれば別 issue に切る。

完了条件:
- schema fixture / smoke が missing required canonical table / column を検出する。
- canonical write owner が Turso 側として明示される。
- Agent-local table が canonical fixture に混ざっていない。
- data model contract と adapter expectations が drift していない。

検証コマンド:
- `node --test tests/contracts/worker-schema-readiness.test.mjs`
- `node --test tests/contracts/worker-note-document-sql-adapter.test.mjs tests/contracts/worker-memory-review-port.test.mjs tests/contracts/worker-provenance-lookup-port.test.mjs`
- `node --test tests/contracts/worker-operation-audit-sql-adapter.test.mjs tests/contracts/worker-operation-proposal-sql-adapter.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `tests/contracts/worker-schema-readiness.test.mjs`
- `tests/fixtures/worker-canonical-schema-fixture.mjs` if needed
- `apps/worker/src/noteDocumentSqlAdapter.ts`
- `apps/worker/src/operationAuditSqlAdapter.ts`
- `apps/worker/src/operationProposalSqlAdapter.ts`
- `apps/worker/src/memoryReviewPort.ts`
- `docs/contracts/data-model.md`
- `docs/contracts/verification-lanes.md`

サブエージェント注意点:
- Adapter SQL の meaning を変更しない。足りない schema expectation を guard する。
- Agent-local queue / digest / dirty marks をこの issue に含めない。

### Issue BAH-03: Persistence: Agent-local SQL readiness

目的:
dirty marks、StructureJob queue、next-open digest、audit recovery queue を Agent-local temporary state として検証し、canonical persistence と分離する。

コンテキスト:
Agent-local SQL は canonical data ではなく temporary state / job / session buffer。Cloudflare Agents + Turso contract は、canonical note data は Turso、workspace-local transient state は Agent-local SQL として扱う。

制約:
- `notes` / `sections` / `blocks` を Agent-local に持たせない。
- Turso Sync を導入しない。
- retry/backoff policy を勝手に追加しない。
- Agent-local schema は temporary state の readiness であり、domain policy owner ではない。

実装メモ:
- Agent-local schema fixture または readiness smoke を追加する。
- expected tables:
  - `agent_local_dirty_scope_marks`
  - `agent_local_structure_jobs`
  - `agent_local_next_open_digest_preparation_intents`
  - `agent_local_operation_audit_recovery_queue`, if BAH-05 adds adapter
- empty statement rejection、workspace boundary、queued/running/completed/failed transition の schema coverage を確認する。
- BAH-02 の canonical fixture と別ファイル / 別 helper にする。

完了条件:
- Agent-local tables は temporary state だけを持つ。
- canonical Note / Section / Block data が Agent-local readiness に混ざっていない。
- queue / digest / dirty mark adapters の SQL assumptions が test で guard されている。
- BAH-04 / BAH-05 の runtime hardening が参照できる readiness lane がある。

検証コマンド:
- `node --test tests/contracts/worker-agent-local-schema-readiness.test.mjs`
- `node --test tests/contracts/worker-scheduler-agent-local-sql-adapter.test.mjs tests/contracts/worker-structure-job-work-queue-agent-local-sql-adapter.test.mjs`
- `node --test tests/contracts/worker-next-open-digest-read-port.test.mjs tests/contracts/worker-operation-audit-recovery-queue.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `tests/contracts/worker-agent-local-schema-readiness.test.mjs`
- `tests/fixtures/worker-agent-local-schema-fixture.mjs` if needed
- `apps/worker/src/schedulerAgentLocalSqlAdapter.ts`
- `apps/worker/src/structureJobWorkQueueAgentLocalSqlAdapter.ts`
- `apps/worker/src/nextOpenDigestReadPort.ts`
- `apps/worker/src/operationAuditRecoveryQueue.ts`
- `docs/contracts/cloudflare-agents-turso.md`
- `docs/contracts/verification-lanes.md`

サブエージェント注意点:
- retry processor や production migration runner を実装しない。
- canonical Turso schema readiness をこの issue に含めない。

### Issue BAH-04: Agent / queue runtime hardening

目的:
StructureJob claim -> Agent handler -> context assembly -> provider generation -> operation routing -> completed/failed terminal transition の runtime slice を harden する。

コンテキスト:
StructureJob processor flow、work queue port、Agent-local SQL adapter、Context Assembly flow、provider generation flow、operation orchestration flow はある。Cloudflare Durable Object adapter は serializable RPC DTO surface を守る必要がある。

制約:
- Agent は scheduler / context / provider / Operation Router policy を再実装しない。
- Durable Object public method は serializable command/result DTO に閉じる。
- no queued job は no-op とし、downstream provider/context/router/audit を呼ばない。
- context/provider/routing/audit failure は canonical Note / Section / Block SoT を mutate しない。

実装メモ:
- `WorkspaceBrainAgent.processNextQueuedStructureJob` に runtime ports を注入 / 構築する seam を設計する。
- fake provider registry / fake operation flow を injected options で使える test seam を先に作る。
- no queued job、claim failure、context failure、provider failure、terminal mark failure、duplicate terminal update を focused tests にする。
- BAH-03 の Agent-local readiness と接続する。

完了条件:
- queued job がない場合 downstream ports are not called。
- claimed running job だけが Agent handler に渡る。
- success path は completed terminal transition を行う。
- failure path は failed transition または recovery boundary に進み、canonical SoT を直接 mutate しない。
- Durable Object public method が non-serializable port/function を受け取らない source guard がある。

検証コマンド:
- `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `node --test tests/contracts/worker-structure-job-processor-flow.test.mjs`
- `node --test tests/contracts/worker-structure-job-work-queue-agent-local-sql-adapter.test.mjs`
- `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `apps/worker/src/cloudflareDurableObjectAgents.ts`
- `apps/worker/src/cloudflareAgentBindings.ts`
- `apps/worker/src/structureJobProcessorFlow.ts`
- `apps/worker/src/structureJobWorkQueuePort.ts`
- `apps/worker/src/structureJobWorkQueueAgentLocalSqlAdapter.ts`
- `tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `tests/contracts/worker-structure-job-processor-flow.test.mjs`

サブエージェント注意点:
- Cloudflare adapter は thin edge adapter のままにする。
- provider SDK、SQL、Operation Router policy を Durable Object class に持ち込まない。
- Context Assembly adapters や Operation Router の policy を変更しない。

### Issue BAH-05: Error / recovery boundary hardening

目的:
provider / context / audit / projection failure の意味を分離し、routing decision を失敗処理で書き換えないようにする。

コンテキスト:
audit persistence failure は recovery queue intent。provider/context failure は Operation Router に到達しない。curl lane に入る前に、失敗時の caller action と observable response を安定させる必要がある。

制約:
- stable failure reason を runtime boundary の語彙で返す。
- vendor error code、SQL detail、auth provider detail を public response / domain policy に漏らさない。
- recovery queue は retry / transaction / Turso executor call を実行しない。
- recovery enqueue failure も routing decision を書き換えない。
- partial write semantics を隠さない。all-or-nothing transaction は別 contract 更新なしに入れない。

実装メモ:
- provider unavailable、invalid ContextEnvelope、audit write failure、recovery enqueue failure、projection persistence failure の caller action を test で固定する。
- Agent-local SQL adapter for operation audit recovery queue が未実装なら追加する。
- `WorkerHttpResponse` failure matrix を backend runtime contract か focused test に固定する。
- status examples:
  - invalid auth -> 401
  - invalid workspace/user/runtime id -> 400
  - invalid body / invalid mapping -> 400
  - unknown route -> 404
  - known path method mismatch -> contract-confirmed 404 or 405
  - missing configured port -> 503
  - persistence infrastructure failure -> stable 500/503 decision

完了条件:
- routing result、audit persistence result、projection/proposal result、recovery enqueue result が別々に観測できる。
- recovery queue adapter は policy/status を再分類しない。
- volatile provider/DB/auth detail が public response に漏れない。
- failure response matrix が curl/smoke から参照できる。

検証コマンド:
- `node --test tests/contracts/worker-operation-routing-flow.test.mjs`
- `node --test tests/contracts/worker-operation-audit-port.test.mjs tests/contracts/worker-operation-audit-recovery-queue.test.mjs`
- `node --test tests/contracts/worker-operation-projection-persistence-flow.test.mjs`
- `node --test tests/contracts/worker-http-error-responses.test.mjs`
- `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `apps/worker/src/operationRoutingFlow.ts`
- `apps/worker/src/operationAuditPersistenceFlow.ts`
- `apps/worker/src/operationAuditRecoveryQueue.ts`
- `apps/worker/src/operationAuditRecoveryAgentLocalSqlAdapter.ts`, if added
- `apps/worker/src/operationProjectionPersistenceFlow.ts`
- `apps/worker/src/workerHttpRouter.ts`
- `tests/contracts/worker-operation-audit-recovery-agent-local-sql-adapter.test.mjs`, if adapter is added
- `tests/contracts/worker-http-error-responses.test.mjs`
- `docs/contracts/backend-runtime.md`
- `docs/contracts/cloudflare-agents-turso.md`

サブエージェント注意点:
- `catch` で default success にしない。
- failure message parse に依存しない。
- retry processor や transaction wrapper を実装しない。
- route decision と recovery status を混ぜない。

### Issue BAH-06: Backend runtime smoke / curl lane

目的:
UI polish 前に Worker API が backend 単体で起動・到達・失敗観測できる lane を作る。

コンテキスト:
既存 hosted E2E は Web 経由も含む。ここでは backend runtime smoke を独立させ、実ブラウザ UI ではなく HTTP boundary と runtime ports の接続を検証する。

制約:
- smoke は injected env / bindings / fixture ports を使う。
- `wrangler.toml` や public HTML に workspace/user/Turso/auth 値を直書きしない。
- smoke のために route handler へ SQL/provider/auth policy を直書きしない。
- OpenAPI projection から route semantics を逆輸入しない。

実装メモ:
- `tests/contracts/backend-runtime-smoke.test.mjs` を追加する。必要であれば `scripts/smoke-worker-runtime.mjs` と `docs/contracts/verification-lanes.md` の lane を追加する。
- `createWorkerFetchHandler()` または actual Worker entrypoint equivalent を使い、curl-like request/response を検証する。
- smoke 対象:
  - `GET /notes/:noteId`
  - `PATCH /blocks/:blockId`
  - `POST /notes/:noteId/leave`
  - `POST /notes/:noteId/structure/manual`
  - `GET /notes/:noteId/digest`
  - `POST /provenance/source`
  - Memory accept/reject/edit/delete/hold route
  - Operation accept/dismiss route
- invalid JSON / invalid auth / invalid route / missing configured port は port factory 前または appropriate boundary で止まることを確認する。

完了条件:
- curl-like lane が deterministic に pass/fail する。
- HTTP status、body shape、auth headers、workspace/user identity、not-configured / invalid mapping response が検証される。
- canonical Note/Section/Block write と Agent-local temporary write が smoke 上でも区別される。
- UI 実装に触れず backend readiness を確認できる。

検証コマンド:
- `node --test tests/contracts/backend-runtime-smoke.test.mjs`
- `node --test tests/contracts/worker-entrypoint.test.mjs tests/contracts/worker-http-router.test.mjs`
- `node --test tests/contracts/hosted-note-surface-e2e.test.mjs`
- `tsc -p tsconfig.json --noEmit`

想定 ownership files:
- `tests/contracts/backend-runtime-smoke.test.mjs`
- `scripts/smoke-worker-runtime.mjs` if needed
- `docs/contracts/verification-lanes.md`
- `apps/worker/src/workerEntrypoint.ts`
- `apps/worker/src/workerHttpRouter.ts`
- `apps/worker/src/workerRuntimePorts.ts`

サブエージェント注意点:
- backend route smoke を担当する。schema/migration や provider runtime hardening を同じ slice に混ぜない。
- curl script を作る場合も runtime values は fixture/env injection に留める。

### Issue BAH-07: Backend readiness review before UI

目的:
BAH-01 から BAH-06 までの実装後に、backend / DDD / architecture readiness を親エージェントがレビューし、UI 実装へ進める状態かを判断する。

コンテキスト:
ユーザーは backend 側、DDD、architecture implementation をさらに積み、その後に curl / tests を行ってから UI 実装へ進みたい。BAH-07 は実装 issue ではなく、最終統合 review / evidence update issue。

制約:
- 新規 feature 実装はしない。blocking finding の修正と docs / verification update に限定する。
- source-of-truth contract と implementation evidence が矛盾する場合、contract を黙って変えず finding として扱う。
- `AGENTS.md` は unrelated local change のまま触らない。

実装メモ:
- 全 hardening issue の diff を DDD 観点で review する。
- review 観点:
  - bounded context ownership
  - dependency direction
  - SoT vs projection separation
  - runtime adapter thinness
  - persistence canonical / temporary split
  - failure meaning and recovery separation
  - test lane coverage
- `docs/records/backend-ddd-hardening-issues-2026-05-19.md` または追加 readiness record に実装結果を追記する。

完了条件:
- blocking architecture findings がない。
- backend smoke / curl lane と focused contract tests が pass している。
- `docs/contracts/verification-lanes.md` が実際の verification command と一致している。
- UI 実装に進める backend readiness が記録されている。

検証コマンド:
- `node --test --test-reporter=dot tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`
- `node scripts/verify-contracts.mjs --lint`
- `node scripts/generate-doc-register.mjs --check`
- `git diff --check`

想定 ownership files:
- `docs/records/backend-ddd-hardening-issues-2026-05-19.md`
- `docs/records/backend-readiness-review-2026-05-19.md`, if a separate record is useful
- `docs/contracts/verification-lanes.md`

サブエージェント注意点:
- この issue は親エージェント review gate。実装サブエージェントには渡さない。
- finding があれば修正 issue に戻し、blocking finding がなくなるまで繰り返す。
