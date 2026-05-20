# Backend architecture refactor implementation plan

ドキュメント種別: record
作成日: 2026-05-20
更新日: 2026-05-20（PM review blocking fixes 反映）
目的: 現在の local Cloudflare Worker / Durable Object smoke closure 差分を含め、backend runtime を clean かつ責務分割された module topology へ移行するための実装計画を記録する。
関連契約: `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/repository-topology.md`, `docs/contracts/verification-lanes.md`
関連 record: `docs/records/local-cloudworker-agents-issues-2026-05-19.md`, `docs/records/local-cloudworker-agents-smoke-handoff-2026-05-20.md`

## Summary

Backend wide の architecture pass として、`apps/worker/src` の flat な runtime 実装を bounded context / runtime role ベースの module topology に再配置する。

今回の refactor は behavior redesign ではない。外部 HTTP API、Worker env 名、Wrangler script 名、contract semantics、local smoke の成功条件は維持する。

**保守性が実際に上がる完成形**: Step 2（移動のみ）ではディレクトリ整理にとどまる。Step 3（責務抽出）+ Step 4（テスト整理）+ topology import guard まで完了して初めて「クリーンかつ責務分割された」状態とみなす。

主な gap:

- `apps/worker/src` が flat で、Note Model、Scheduler、Context Assembly、Memory、AI Operations、Cloudflare runtime、HTTP runtime の変更理由が同階層に混在している。
- `cloudflareDurableObjectAgents.ts` が Durable Object class、Agent-local SQL executor lifecycle、local smoke support、WorkspaceBrain processor option resolution、RPC result mapping を同居させている。
- `workerRuntimePorts.ts` が deployment env / bindings からほぼ全 runtime port を組み立てる中心点になっている。
- `scripts/smoke-worker-local-runtime.mjs` が Wrangler 起動、fixture generation、HTTP smoke runner、failure classification、curl-like logging を 1 file で所有している。
- 一部 tests が behavior より source text / file path guard に寄っており、module move のたびに広範囲更新が必要になる。
- フォルダ移動だけでは import 方向が強制されず、shortcut import が再発しうる。

## Naming: `apps/worker/src/*` と `contexts/*`

| Path | 所有するもの | 変わる理由 |
| --- | --- | --- |
| `contexts/*/src/contract/*` | live product semantics（policy、不変条件、型） | プロダクト契約の変更 |
| `apps/worker/src/<context>/` | 上記 contract を消費する runtime flow / port / SQL adapter | 永続化・ランタイム接続・framework binding の変更 |
| `apps/worker/src/runtime/*` | HTTP / Cloudflare / composition / local verification | デプロイ形態・検証レーンの変更 |

`apps/worker/src/note-model` は `contexts/note-model` の **runtime adapter 層** であり、semantic の複製ではない。policy は常に `contexts/*` と `docs/contracts/**` を参照する。

## Target Topology

`apps/worker/src` を次の owner grouping へ移す。

- `runtime/http`
  - Worker fetch entrypoint、HTTP router、auth/workspace boundary。
  - **今回の scope 外**: `workerHttpRouter.ts`（約 780 行）の handler 単位分割。移動のみ行い、route 登録と delegation の behavior は変えない。
  - HTTP entry は route orchestration の入口なので、port / result / handler type に限り `note-model`, `scheduler`, `memory`, `ai-operations` を参照してよい。ただし SQL adapter、Cloudflare binding、local verification helper は直接 import しない。
- `runtime/cloudflare`
  - Cloudflare deployment entrypoint、Durable Object classes、Agent RPC boundary、Durable Object SQL adapter、binding descriptors、Agent-local schema command。
- `runtime/composition`
  - deployment-supplied env / bindings から runtime ports を組み立てる wiring（Step 3 でファイル分割、barrel なし）。
- `runtime/local-verification`
  - local-only smoke setup、local fixture ports、WorkspaceBrain local trigger support。
  - production entry path からは `LOCAL_AGENT_SMOKE_ENABLED` ガード付きの呼び出しに限定する。
- `note-model`
  - canonical Note / Section / Block persistence、block command boundary、provenance read boundary。
- `scheduler`
  - structure trigger flow、note structure route handler、Agent-local scheduler SQL、StructureJob queue port、next-open digest preparation/read boundary。
  - 所有する route handler は dirty scope / trigger / job planning まで。Context Assembly や AI Operations を呼ぶ StructureJob 実行 handler は所有しない。
- `context-assembly`
  - context assembly runtime flow、target/local/related/memory retrieval adapters。
- `memory`
  - memory review boundary、memory candidate approval input / persistence boundary。
  - Memory は memory-owned DTO を受け取り、AI Operation approval の具体型には依存しない。
- `ai-operations`
  - operation generation provider flow、Operation Router adapter/flow、audit/proposal/projection persistence boundaries、operation approval route handler。
  - accepted operation intent から memory-owned candidate approval input への mapping を所有し、Memory 側へ渡す。
- `ai-operations/structure-job`（横断 orchestration の単一 owner）
  - StructureJob Agent handler、StructureJob processor flow、structure job operation flow、structure job operation orchestration flow。
  - Scheduler → Context Assembly → AI Operations の実行接続は **このフォルダだけ** が所有する。Scheduler / Context Assembly / AI Operations の通常フォルダ同士は、この実行 flow のために相互 import しない。

Barrel exports は原則作らない。import は owner file を直接参照し、shared convenience module を作らない。

## Allowed Import Direction

フォルダ名だけでは境界が守れないため、移動後に contract test で固定する。矢印は「import してよい」方向。

```text
contexts/*/src/contract/*
  ↑ (すべての apps/worker/src 配下から参照可。逆方向は禁止)

runtime/http
  → runtime/composition
  → note-model / scheduler / memory / ai-operations（route handler / port / result 型のみ）
  → （禁止）SQL adapter, runtime/cloudflare, runtime/local-verification

runtime/cloudflare
  → runtime/composition
  → runtime/cloudflare/*（helpers）
  → runtime/local-verification（smoke 分岐・schema command のみ。常時 import 可だが呼び出しは env ガード必須）

runtime/composition
  → note-model / scheduler / context-assembly / memory / ai-operations（adapter・port factory のみ）
  → runtime/cloudflare（binding descriptor 型のみ）

runtime/local-verification
  → runtime/composition
  → scheduler（Agent-local smoke port 構築のみ）

note-model
  → contexts/note-model
  → （禁止）scheduler, context-assembly, memory, ai-operations, runtime/local-verification

scheduler
  → contexts/scheduler
  → note-model（snapshot / persistence port のみ）
  → （禁止）ai-operations, context-assembly, memory

context-assembly
  → contexts/context-assembly
  → note-model（read snapshot port のみ）
  → memory（read retrieval port のみ）
  → （禁止）ai-operations

memory
  → contexts/memory
  → note-model（source-backed write intent mapping のみ）
  → （禁止）ai-operations, scheduler, context-assembly flow
  → （禁止）ApprovedOperationIntent など AI Operation approval の具体型

ai-operations
  → contexts/ai-operations
  → memory（accepted operation → memory candidate approval input mapping のみ）
  → （禁止）scheduler flow, context-assembly flow を直接 import（structure-job 経由）

ai-operations/structure-job
  → scheduler（work queue port）
  → context-assembly（runtime flow + retrieval ports）
  → ai-operations（generation, routing, audit, projection, proposal）
  → runtime/composition（processor options 型・factory のみ）

（禁止・全体）
  - 任意の context フォルダ → runtime/local-verification
  - contexts/* → apps/worker/*
  - shortcut: note-model → Turso canonical write を ai-operations から行う import
```

Step 4 で `tests/contracts/worker-topology-import-guard.test.mjs` を追加し、上記の forbidden edge を静的に検査する。behavior test への置き換えではなく、topology 専用の最小 guard とする。

## File Move Mapping（Step 2）

Step 2 は原則 1:1 移動のみ。ファイル名は原則維持する。ただし `noteStructureRuntimeHandlers.ts` は現在 1 file に Scheduler route handling と StructureJob Agent execution orchestration が混在しているため、behavior を変えない最小 split を Step 2 の例外として行う。

| Current path | Target path |
| --- | --- |
| `workerEntrypoint.ts` | `runtime/http/workerEntrypoint.ts` |
| `workerHttpRouter.ts` | `runtime/http/workerHttpRouter.ts` |
| `workerAuthBoundary.ts` | `runtime/http/workerAuthBoundary.ts` |
| `cloudflareWorkerEntrypoint.ts` | `runtime/cloudflare/cloudflareWorkerEntrypoint.ts` |
| `cloudflareDurableObjectAgents.ts` | `runtime/cloudflare/cloudflareDurableObjectAgents.ts` |
| `cloudflareAgentRpcBoundary.ts` | `runtime/cloudflare/cloudflareAgentRpcBoundary.ts` |
| `cloudflareDurableObjectSqlAdapter.ts` | `runtime/cloudflare/cloudflareDurableObjectSqlAdapter.ts` |
| `cloudflareAgentBindings.ts` | `runtime/cloudflare/cloudflareAgentBindings.ts` |
| `cloudflareWorkersRuntimeTypes.d.ts` | `runtime/cloudflare/cloudflareWorkersRuntimeTypes.d.ts` |
| `durableObjectAgentLocalSchema.ts` | `runtime/cloudflare/durableObjectAgentLocalSchema.ts` |
| `workerRuntimePorts.ts` | `runtime/composition/workerRuntimePorts.ts` |
| `localSmokeRuntime.ts` | `runtime/local-verification/localSmokeRuntime.ts` |
| `noteDocumentPersistencePort.ts` | `note-model/noteDocumentPersistencePort.ts` |
| `noteDocumentSqlAdapter.ts` | `note-model/noteDocumentSqlAdapter.ts` |
| `noteBlockCommandPort.ts` | `note-model/noteBlockCommandPort.ts` |
| `provenanceLookupPort.ts` | `note-model/provenanceLookupPort.ts` |
| `noteStructureRuntimeHandlers.ts` | `scheduler/noteStructureRouteHandler.ts`（dirty scope / trigger / job planning 部分のみ） |
| `noteStructureRuntimeHandlers.ts` | `ai-operations/structure-job/structureJobAgentHandler.ts`（StructureJob Agent handler / Context Assembly / AI Operations orchestration 接続部分） |
| `structureSchedulerRuntimeFlow.ts` | `scheduler/structureSchedulerRuntimeFlow.ts` |
| `schedulerAgentLocalSqlAdapter.ts` | `scheduler/schedulerAgentLocalSqlAdapter.ts` |
| `schedulerNoteSnapshotSqlAdapter.ts` | `scheduler/schedulerNoteSnapshotSqlAdapter.ts` |
| `structureJobWorkQueuePort.ts` | `scheduler/structureJobWorkQueuePort.ts` |
| `structureJobWorkQueueAgentLocalSqlAdapter.ts` | `scheduler/structureJobWorkQueueAgentLocalSqlAdapter.ts` |
| `nextOpenDigestReadPort.ts` | `scheduler/nextOpenDigestReadPort.ts` |
| `contextAssemblyRuntimeFlow.ts` | `context-assembly/contextAssemblyRuntimeFlow.ts` |
| `contextAssemblyTargetSnapshotSqlAdapter.ts` | `context-assembly/contextAssemblyTargetSnapshotSqlAdapter.ts` |
| `contextAssemblyLocalStructureSqlAdapter.ts` | `context-assembly/contextAssemblyLocalStructureSqlAdapter.ts` |
| `contextAssemblyRelatedContextSqlAdapter.ts` | `context-assembly/contextAssemblyRelatedContextSqlAdapter.ts` |
| `contextAssemblyMemoryContextSqlAdapter.ts` | `context-assembly/contextAssemblyMemoryContextSqlAdapter.ts` |
| `memoryReviewPort.ts` | `memory/memoryReviewPort.ts` |
| `memoryCandidateProposalBoundary.ts` | `memory/memoryCandidateProposalBoundary.ts`（memory-owned approval input / persistence boundary） |
| `operationGenerationProviderFlow.ts` | `ai-operations/operationGenerationProviderFlow.ts` |
| `operationRoutingAdapter.ts` | `ai-operations/operationRoutingAdapter.ts` |
| `operationRoutingFlow.ts` | `ai-operations/operationRoutingFlow.ts` |
| `operationAuditPort.ts` | `ai-operations/operationAuditPort.ts` |
| `operationAuditSqlAdapter.ts` | `ai-operations/operationAuditSqlAdapter.ts` |
| `operationAuditPersistenceFlow.ts` | `ai-operations/operationAuditPersistenceFlow.ts` |
| `operationAuditRecoveryQueue.ts` | `ai-operations/operationAuditRecoveryQueue.ts` |
| `operationAuditRecoveryAgentLocalSqlAdapter.ts` | `ai-operations/operationAuditRecoveryAgentLocalSqlAdapter.ts` |
| `tursoOperationAuditExecutor.ts` | `ai-operations/tursoOperationAuditExecutor.ts` |
| `operationProjectionPort.ts` | `ai-operations/operationProjectionPort.ts` |
| `operationProjectionPersistenceFlow.ts` | `ai-operations/operationProjectionPersistenceFlow.ts` |
| `operationProposalPort.ts` | `ai-operations/operationProposalPort.ts` |
| `operationProposalSqlAdapter.ts` | `ai-operations/operationProposalSqlAdapter.ts` |
| `operationApprovalRuntimeHandlers.ts` | `ai-operations/operationApprovalRuntimeHandlers.ts` |
| `structureJobProcessorFlow.ts` | `ai-operations/structure-job/structureJobProcessorFlow.ts` |
| `structureJobOperationFlow.ts` | `ai-operations/structure-job/structureJobOperationFlow.ts` |
| `structureJobOperationOrchestrationFlow.ts` | `ai-operations/structure-job/structureJobOperationOrchestrationFlow.ts` |

**デプロイ descriptor の更新（Step 2 必須）**

| File | 変更 |
| --- | --- |
| `wrangler.toml` | `main = "apps/worker/src/runtime/cloudflare/cloudflareWorkerEntrypoint.ts"` |
| `package.json` / tsconfig paths | worker entry 参照があれば同様に更新 |
| `tests/contracts/**` | import path を mapping 表に従い一括更新 |
| path 固定の source guard | 新 path へ更新、または `worker-topology-import-guard` へ集約 |

## Composition Split（Step 3）

`runtime/composition/workerRuntimePorts.ts` を hub のまま残さない。barrel は作らず、次の owner file に分割する。

| New file | 所有する composition |
| --- | --- |
| `runtime/composition/noteModelPorts.ts` | Note document、block command、provenance Turso adapters |
| `runtime/composition/contextAssemblyPorts.ts` | Context Assembly target / local structure / related context / memory retrieval adapters |
| `runtime/composition/memoryPorts.ts` | Memory review、memory candidate persistence adapters |
| `runtime/composition/aiOperationPorts.ts` | Operation audit、proposal、projection、routing、provider adapters |
| `runtime/composition/agentLocalPorts.ts` | scheduler Agent-local、structure job queue、audit recovery queue |
| `runtime/composition/workspaceBrainProcessorOptions.ts` | WorkspaceBrain StructureJob processor options factory |
| `runtime/composition/workerRuntimePorts.ts` | 上記を呼ぶ thin explicit entrypoint（`createWorkerRuntimePorts` の公開面は維持） |

## Implementation Steps

### 1. Baseline hygiene

- 既存 local Worker dev session を止め、port 8787 を空ける。
- untracked `skills/` は今回の commit 対象から外す。
- 現在の local smoke closure 差分を含めたまま、次を baseline として確認する。
  - `tsc -p tsconfig.json --noEmit`
  - `node scripts/verify-contracts.mjs --lint`
  - focused worker tests for Cloudflare RPC / DO SQL / Worker entrypoint / local smoke classification

### 2. Module topology move

- [File Move Mapping](#file-move-mappingstep-2) に従って files を移動する。
- この段階では behavior を変えない。
- `noteStructureRuntimeHandlers.ts` だけは ownership split を行う。
  - `scheduler/noteStructureRouteHandler.ts`: HTTP route から dirty scope / trigger / job planning まで。
  - `ai-operations/structure-job/structureJobAgentHandler.ts`: Agent RPC から StructureJob processing / Context Assembly / AI Operations orchestration まで。
- relative imports、tests import paths、`wrangler.toml` main path を更新する。
- `docs/contracts/**` の policy は変更しない。必要なら本 record に移行メモだけを残す。

**Step 2 Definition of Done**

- mapping 表に列挙された source files がすべて target path に存在し、`noteStructureRuntimeHandlers.ts` の 2 target split が完了している。
- `wrangler.toml` の `main` が新 cloudflare entrypoint を指す。
- focused worker tests が import path 更新後に green。
- behavior test が import path 以外の理由で落ちた場合は [Stop Conditions](#stop-conditions) に従い停止。
- forbidden import はまだ guard 未追加でもよい（Step 4 で追加）。

### 3. Runtime responsibility extraction

- `runtime/cloudflare`:
  - Durable Object classes は public RPC DTO を受けて framework-neutral delegate へ渡す edge adapter に近づける。
  - lazy Agent-local SQL executor 読み取りを `runtime/cloudflare/agentLocalSqlLifecycle.ts`（新規）に抽出する。
  - stable RPC / schema failure result helper を `runtime/cloudflare/agentRpcResults.ts`（新規）に寄せる。
- `runtime/local-verification`:
  - local smoke scheduler snapshot と smoke-only port construction を `runtime/local-verification/localSmokeSchedulerPorts.ts`（新規）へ分離し、Durable Object class から除去する。
  - product API route ではなく verification surface であることを module 名と tests で明示する。
- `runtime/composition`:
  - [Composition Split](#composition-splitstep-3) に従い分割する。
  - `workerRuntimePorts.ts` は thin explicit entrypoint のみ残す。
- `ai-operations` / `memory`:
  - accepted operation intent から memory candidate を作る mapping を `ai-operations/memoryCandidateApprovalMapping.ts`（新規）へ抽出する。
  - `memory/memoryCandidateProposalBoundary.ts` は `MemoryCandidateApprovalInput` のような memory-owned DTO だけを受け取り、`ApprovedOperationIntent` など AI Operation approval の具体型を import しない。
- `scripts/worker-local-smoke/`:
  - `wranglerDev.mjs` — Wrangler dev 起動
  - `httpSmokeRunner.mjs` — HTTP request runner
  - `fixtures.mjs` — fixture construction
  - `failureClassification.mjs` — assertion / setup failure / blocker / smoke failure 分類
  - `logging.mjs` — curl-like log formatting
  - `scripts/smoke-worker-local-runtime.mjs` — CLI orchestration entrypoint のみ残す

**Step 3 Definition of Done**

- `cloudflareDurableObjectAgents.ts` に local smoke port 構築・`localSmokeSectionsByNoteId` state が残っていない。
- composition hub が owner file に分割され、各ファイルが単一の composition 理由のみを持つ。
- `memory/memoryCandidateProposalBoundary.ts` が `ai-operations` の concrete approval type を import していない。
- `ai-operations/structure-job/` が StructureJob 横断 orchestration の唯一の import ハブである。

### 4. Test strategy cleanup

- source text / file path guard は topology / forbidden dependency の最小限に集約する。
- behavior を守るべきものは public boundary tests へ寄せる。
- 追加: `tests/contracts/worker-topology-import-guard.test.mjs`（[Allowed Import Direction](#allowed-import-direction) の forbidden edge）。
- 残す regression tests:
  - Cloudflare DO RPC は direct public method call shape を使う。
  - DO SQL adapter は local runtime storage shape を受けられる。
  - local smoke setup failure / blocker / smoke failure classification が分離される。
  - local-only WorkspaceBrain trigger は product route に登録されない。

## Verification Plan

Topology move 後（Step 2 DoD）:

```sh
tsc -p tsconfig.json --noEmit
node --test tests/contracts/worker-cloudflare-agent-rpc-boundary.test.mjs \
  tests/contracts/worker-cloudflare-durable-object-sql-adapter.test.mjs \
  tests/contracts/worker-entrypoint.test.mjs \
  tests/contracts/worker-local-smoke-script-failure-classification.test.mjs
```

Extraction + test cleanup 後（Step 3–4 DoD）:

```sh
tsc -p tsconfig.json --noEmit
node scripts/verify-contracts.mjs --lint
node --test tests/contracts/worker-topology-import-guard.test.mjs
node --test tests/**/*.test.mjs
node scripts/generate-doc-register.mjs --check
git diff --check
```

Final local runtime lane:

```sh
WORKER_LOCAL_PERSIST_TO="/private/tmp/ai-native-note-worker-smoke-state-$(date +%s)" npm run worker:local:smoke
```

## Assumptions

- 現在の smoke closure diff は refactor と一緒に扱い、別 commit 前提にはしない。
- 最初の slice は module topology move。behavior redesign は行わない。
- public HTTP routes、Worker env names、local smoke command names、contract semantics は維持する。
- Cloudflare deploy、real Turso connection、real AI provider integration は今回の refactor scope 外。
- `skills/` directory は今回の backend architecture refactor scope 外。
- `workerHttpRouter.ts` の route 単位分割は今回 scope 外（移動のみ）。

## Stop Conditions

- `docs/contracts/**` にない product policy 変更が必要になった場合は停止し、owner contract 更新を先に判断する。
- module move だけで behavior test が落ち、原因が import path 以外の場合は停止して bug / unintended behavior change として切り分ける。
- local smoke が `setup failure` / `blocked` ではなく product route `smoke failure` を返した場合は、topology refactor の副作用として扱い修正する。
- Step 3 完了後も `runtime/composition/workerRuntimePorts.ts` が複数 composition 理由を抱えたままなら、Step 3 未完了として扱い、分割完了まで merge しない。
