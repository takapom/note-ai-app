# Local CloudWorker Agents issues

ドキュメント種別: record  
作成日: 2026-05-19  
目的: UI 実装前に、local Cloudflare Worker / Durable Object Agents 上で Worker HTTP、NoteAgent RPC、WorkspaceBrainAgent RPC、Agent-local SQL、canonical Turso-like persistence の通信が通ることを repo-owned に検証できる状態へ進める。  
関連契約: `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/verification-lanes.md`  
外部参照: Cloudflare Workers local development, Durable Object RPC, local data docs

## 背景

現状は `createWorkerFetchHandler()` を in-process に呼ぶ backend runtime smoke が pass している。これは Worker API route と runtime ports の到達性を検証しているが、`wrangler dev` / local workerd 上の Durable Object namespace を経由した Agent RPC 通信までは固定していない。

Cloudflare docs 上、local development は `wrangler dev` / Miniflare / workerd を使い、bindings は local simulation として `env` からアクセスされる。Durable Object public methods は Worker から stub 経由の RPC として呼び出せる。Durable Object local state は CLI で直接 seed するのではなく、application code が DO instance を作って method を呼ぶ必要がある。

このフェーズのゴールは、local Cloudflare runtime で次を観測できること:

- HTTP request が Worker entrypoint に届く。
- Worker が Durable Object namespace から `NoteAgent` stub を解決し、serializable RPC command を送れる。
- `NoteAgent` が Agent-local SQL temporary state と Turso-like canonical read を分けて StructureJob scheduling まで進める。
- Worker または local-only internal trigger が `WorkspaceBrainAgent` stub を解決し、queued StructureJob processing RPC を送れる。
- WorkspaceBrain path は provider / Operation Router / audit / recovery queue まで runtime ports 経由で進み、user-authored Note / Section / Block SoT を直接 mutate しない。
- 実 HTTP smoke が status/body を検証し、curl で再現可能な request 例を出せる。

## 境界判断

- `wrangler.toml` は deployment descriptor のままにし、Turso URL/token、workspace/user id、auth secret、local fixture 値を持たせない。
- `.dev.vars` は local operator owned file として gitignore される。repo は key name と手順だけを持ち、実値・placeholder tenant id・sentinel id を持たない。
- Durable Object class は Cloudflare adapter であり、provider SDK、Operation Router policy、SQL mapping policy、canonical Note Model policy を所有しない。
- Agent-local SQL は Durable Object instance-local temporary state。canonical Note / Section / Block は Turso-like canonical binding または local canonical fixture binding からのみ読む/書く。
- Local smoke 用の seed / process trigger を追加する場合は、product API surface ではなく local verification surface として明示し、auth/shared-secret と local enable flag で閉じる。

## 実装チケット

| ID | タイトル | 並列可 | 依存 | 主担当 |
| --- | --- | --- | --- | --- |
| LCWA-01 | Local Cloudflare runtime tooling / scripts | yes | none | tooling subagent |
| LCWA-02 | Durable Object namespace env boundary | yes | none | runtime boundary subagent |
| LCWA-03 | Durable Object Agent-local SQL adapter | yes | LCWA-02 | Agent-local persistence subagent |
| LCWA-04 | Worker -> NoteAgent RPC structure route | no | LCWA-02, LCWA-03 | NoteAgent routing subagent |
| LCWA-05 | Worker -> WorkspaceBrainAgent local process trigger | no | LCWA-02, LCWA-03 | WorkspaceBrain routing subagent |
| LCWA-06 | Local runtime seed/reset path | yes | LCWA-03, LCWA-04 | local data subagent |
| LCWA-07 | Real local HTTP smoke / curl lane | no | LCWA-01, LCWA-04, LCWA-05, LCWA-06 | smoke subagent |
| LCWA-08 | Contract/register/review closure | no | LCWA-01-07 | review owner |

## Issue LCWA-01: Local Cloudflare runtime tooling / scripts

### 目的

local workerd 上で Worker と Durable Objects を起動し、開発者が同じコマンドで local communication smoke を走らせられるようにする。

### コンテキスト

`wrangler.toml` は既に `apps/worker/src/cloudflareWorkerEntrypoint.ts`、static assets、Durable Object bindings、migration classes を指している。`package.json` には Worker local dev / smoke 用 script がまだない。

### 制約

- `wrangler.toml` に runtime secret / workspace / user / Turso values を追加しない。
- `.wrangler/` と `.dev.vars` は gitignore のまま扱う。
- 実装判断の SoT は `docs/contracts/**`。README だけに policy を置かない。

### 実装メモ

- `package.json` に local runtime script を追加する。
- wrangler を devDependency に固定するか、repo command は `npx wrangler` 前提にするかを決め、決定理由を docs record に追記する。
- local state directory は `.wrangler/state` または明示 `--persist-to` を使う。どちらを採る場合も commit 対象にしない。
- 必要なら `scripts/smoke-worker-local-runtime.mjs` の runner から port readiness 待ちを行う。

### 完了条件

- local Worker を起動する標準コマンドが repo に存在する。
- local smoke を起動する標準コマンドが repo に存在する。
- local runtime values は repo-tracked config に入らない。

### Status notes, tooling/smoke slice 2026-05-19

- Added `npm run worker:local` as the repo-owned local Worker command. It delegates to `scripts/smoke-worker-local-runtime.mjs --serve-only`, checks for an installed Wrangler CLI, and starts `wrangler dev --port ... --persist-to .wrangler/state`.
- Added `npm run worker:local:smoke` as the real HTTP smoke entrypoint. The script starts Wrangler unless `WORKER_LOCAL_URL` targets an already-running local Worker.
- Decision: Wrangler is an external local tool for this slice, not a new `devDependency`, because this subtask owns only package scripts in `package.json` and should not introduce dependency/package-lock churn. Absence is reported as setup failure with install guidance.
- Decision: local persistence uses `.wrangler/state`, already ignored by git, and the script does not write runtime values to `wrangler.toml` or public HTML.

### 検証コマンド

- `npm run typecheck`
- `node --test tests/contracts/cloudflare-deployment-config.test.mjs tests/contracts/deployment-environment-values.test.mjs`

### 想定変更ファイル

- `package.json`
- `scripts/smoke-worker-local-runtime.mjs`
- `docs/contracts/verification-lanes.md`
- `docs/records/local-cloudworker-agents-issues-2026-05-19.md`

## Issue LCWA-02: Durable Object namespace env boundary

### 目的

Worker runtime が `NOTE_AGENT` / `WORKSPACE_BRAIN_AGENT` Durable Object namespace binding を typed env boundary として扱い、stub 解決と RPC error normalization を thin adapter に閉じる。

### Status notes, RPC boundary slice 2026-05-19

- Added `apps/worker/src/cloudflareAgentRpcBoundary.ts`.
- NoteAgent object names are `workspaceId:noteId`; WorkspaceBrainAgent object names are `workspaceId`.
- RPC helper validates serializable DTO commands, reads namespace-like bindings, invokes public methods, and normalizes missing namespace / missing method / thrown RPC failures without exposing volatile Cloudflare/workerd details.
- Integrated `NOTE_AGENT` into Worker runtime port wiring as a route-level `noteStructureRoute` port. `WorkerHttpRouter` stays Cloudflare-free and delegates structure routes through the port before falling back to direct scheduler ports.

### コンテキスト

`wrangler.toml` と `cloudflareAgentBindings.ts` は descriptor を持つが、`WorkerEntrypointEnv` / runtime ports は Durable Object namespace を具体的な env dependency として読んでいない。

### 制約

- Cloudflare-specific type/import は Worker adapter 側に閉じる。
- Domain/runtime flow に Durable Object stub shape を漏らさない。
- public RPC command は serializable DTO のみ。

### 実装メモ

- `WorkerEntrypointEnv` または dedicated env type に `NOTE_AGENT` / `WORKSPACE_BRAIN_AGENT` namespace を追加する。
- namespace から deterministic object name を作る helper を追加する。例: note-scoped key は `workspaceId:noteId`、workspace-scoped key は `workspaceId`。
- stub RPC failure は stable runtime error に正規化する。raw Cloudflare/workerd exception message を HTTP/RPC response に出さない。
- source guard で app/domain modules が Durable Object namespace internals に依存しないことを確認する。

### 完了条件

- Worker adapter が NoteAgent / WorkspaceBrainAgent namespace の有無を検出できる。
- namespace missing / RPC failure の response meaning が stable。
- Durable Object binding descriptor と env boundary が drift しない。

### 検証コマンド

- `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs tests/contracts/worker-entrypoint.test.mjs`
- `node --test tests/contracts/topology-runtime.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### 想定変更ファイル

- `apps/worker/src/workerEntrypoint.ts`
- `apps/worker/src/workerRuntimePorts.ts`
- `apps/worker/src/cloudflareDurableObjectAgents.ts`
- `apps/worker/src/cloudflareAgentBindings.ts`
- `tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `tests/contracts/worker-entrypoint.test.mjs`

## Issue LCWA-03: Durable Object Agent-local SQL adapter

### 目的

Cloudflare Durable Object instance-local SQLite / SQL API を現在の Agent-local executor interface に接続し、Agent-local temporary state を true DO-local state として扱えるようにする。

### Status notes, DO-local SQL slice 2026-05-19

- Added `apps/worker/src/cloudflareDurableObjectSqlAdapter.ts`.
- The adapter wraps `ctx.storage.sql.exec(query, ...bindings)`-style APIs and exposes the repo-compatible `execute`, `query`, and `write` methods.
- Deployable `NoteAgent` and `WorkspaceBrainAgent` now construct an Agent-local SQL executor from Durable Object storage and pass it as the Agent-local override when building scheduler / processor runtime ports.
- Canonical Turso access remains env/binding supplied; DO-local SQL is used only for Agent-local temporary state.

### コンテキスト

現在の default wiring は `AGENT_LOCAL_SQL` binding を `WorkerTursoSqlExecutor` 互換 client として読む。local Cloudflare Agents 検証では、Durable Object の instance-local storage を使う path が必要になる。

### 制約

- Agent-local storage に canonical `notes` / `sections` / `blocks` を置かない。
- SQL adapter は statement execution / rows mapping だけを担当し、scheduler / work queue / context / provider policy を持たない。
- DO adapter は canonical Turso executor と Agent-local executor を混同しない。

### 実装メモ

- `DurableObjectState` / `ctx.storage.sql` 互換の executor adapter を追加する。
- `NoteAgent` は scheduling に必要な Agent-local scheduler tables を instance-local SQL に初期化できるようにする。
- `WorkspaceBrainAgent` は StructureJob work queue / next-open digest / recovery queue を instance-local SQL から使えるようにする。
- SQL schema readiness は fixture と対応させ、missing table failure が stable に出ることを確認する。

### 完了条件

- DO-local SQL executor 経由で Agent-local scheduler / work queue adapters が動く。
- canonical Turso fixture/client と Agent-local DO storage の write ledger が分離して観測できる。
- no direct SoT mutation guard が pass。

### 検証コマンド

- `node --test tests/contracts/worker-agent-local-schema-readiness.test.mjs`
- `node --test tests/contracts/worker-scheduler-agent-local-sql-adapter.test.mjs tests/contracts/worker-structure-job-work-queue-agent-local-sql-adapter.test.mjs`
- `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### 想定変更ファイル

- `apps/worker/src/cloudflareDurableObjectAgents.ts`
- `apps/worker/src/workerRuntimePorts.ts`
- `apps/worker/src/schedulerAgentLocalSqlAdapter.ts`
- `apps/worker/src/structureJobWorkQueueAgentLocalSqlAdapter.ts`
- `tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `tests/contracts/worker-agent-local-schema-readiness.test.mjs`

## Issue LCWA-04: Worker -> NoteAgent RPC structure route

### 目的

local Worker HTTP route から Durable Object namespace 経由で `NoteAgent.scheduleNoteStructure` を呼び、note leave / manual organize が Cloudflare Agent communication path を通ることを固定する。

### Status notes, NoteAgent route slice 2026-05-19

- Added `NoteStructureRoutePort` as the router-facing seam.
- `WorkerHttpRouter` delegates `POST /notes/:noteId/leave` and `POST /notes/:noteId/structure/manual` to `noteStructureRoute` when present and otherwise preserves the existing direct scheduler-port path.
- `createWorkerRuntimePorts()` creates the NoteAgent-backed route port when the `NOTE_AGENT` Durable Object namespace binding is available.

### コンテキスト

現在の `WorkerHttpRouter` は `noteStructure` ports を直接受け取り `runNoteStructureRouteHandler` に委譲できる。local Cloudflare runtime では Worker -> NoteAgent RPC を通す path が必要。

### 制約

- `WorkerHttpRouter` に Cloudflare namespace / stub detail を入れない。
- NoteAgent は scheduler policy を再実装しない。
- HTTP response shape は `api-events.md` / backend runtime smoke の期待値を壊さない。

### 実装メモ

- runtime port wiring に `noteStructure` direct ports と `noteStructureAgentDispatcher` のどちらを使うかの composition boundary を設ける。
- `NOTE_AGENT` namespace がある場合、route command DTO を作って `scheduleNoteStructure` RPC を呼ぶ adapter を追加する。
- Note-scoped DO instance name は workspaceId + noteId で安定化する。
- RPC result を既存 route response に mapping する。missing namespace / RPC failure は stable 501/502 系 meaning にする。

### 完了条件

- `POST /notes/:noteId/leave` と `POST /notes/:noteId/structure/manual` が NoteAgent stub を呼んだことを contract test で観測できる。
- in-process direct port smoke は維持される。
- local Cloudflare smoke で NoteAgent RPC が通る。

### 検証コマンド

- `node --test tests/contracts/worker-http-router.test.mjs tests/contracts/worker-entrypoint.test.mjs`
- `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `node --test tests/contracts/backend-runtime-smoke.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### 想定変更ファイル

- `apps/worker/src/workerRuntimePorts.ts`
- `apps/worker/src/workerHttpRouter.ts`
- `apps/worker/src/noteStructureRuntimeHandlers.ts`
- `apps/worker/src/cloudflareDurableObjectAgents.ts`
- `tests/contracts/worker-entrypoint.test.mjs`
- `tests/contracts/worker-http-router.test.mjs`

## Issue LCWA-05: Worker -> WorkspaceBrainAgent local process trigger

### 目的

local runtime で queued StructureJob を `WorkspaceBrainAgent.processNextQueuedStructureJob` RPC に渡し、WorkspaceBrain processing communication が通ることを確認できる trigger を用意する。

### Status notes, local WorkspaceBrain trigger slice 2026-05-19

- Added the local-only path `/__local/agents/workspace/process` in `Worker fetch` entrypoint, not in `WorkerHttpRouter` product route matching.
- The trigger is gated by `LOCAL_AGENT_SMOKE_ENABLED=1`, normal auth/workspace normalization, and a required userId.
- The trigger calls `WORKSPACE_BRAIN_AGENT` through the RPC boundary and does not create product router ports.
- `scripts/smoke-worker-local-runtime.mjs` now defaults the WorkspaceBrain smoke request to this path.

### コンテキスト

WorkspaceBrainAgent の deployable processor wiring は存在するが、local HTTP から WorkspaceBrainAgent stub を呼ぶ repo-owned path がない。通常 product UI に永続 AI chat や mode switch は追加しないため、検証用 trigger は product surface と分ける必要がある。

### 制約

- MVP product API scope を広げない。
- local-only/internal trigger は explicit enable flag と auth を必須にする。
- WorkspaceBrainAgent は provider / Operation Router / audit policy を再実装しない。
- provider registry / Operation Router snapshot は deployment/runtime supplied dependency として注入する。

### 実装メモ

- `LOCAL_AGENT_SMOKE_ENABLED` のような local verification flag を runtime env boundary に追加する。repo-tracked config に値を置かない。
- local-only route または scheduled/test trigger を検討し、選んだ理由をこの record に追記する。
- trigger は `workspaceId`, `userId`, `now` だけの serializable command から WorkspaceBrain DO stub を解決する。
- no queued job、provider unavailable、context failure、audit failure の stable response を smoke で確認する。

### 完了条件

- local Worker 経由で WorkspaceBrainAgent RPC が 1 回以上呼ばれる。
- queued job なしでは downstream provider / Operation Router に進まない。
- queued job ありでは provider registry と operation flow に到達し、canonical Note / Block SoT は直接 mutate しない。

### 検証コマンド

- `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs tests/contracts/worker-structure-job-processor-flow.test.mjs`
- `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### 想定変更ファイル

- `apps/worker/src/workerEntrypoint.ts`
- `apps/worker/src/workerRuntimePorts.ts`
- `apps/worker/src/cloudflareDurableObjectAgents.ts`
- `tests/contracts/worker-entrypoint.test.mjs`
- `tests/contracts/worker-cloudflare-agent-bindings.test.mjs`

## Issue LCWA-06: Local runtime seed/reset path

### 目的

local Cloudflare runtime に canonical fixture data と Agent-local temporary data を投入し、smoke が deterministic に pass/fail する状態を作る。

### コンテキスト

Cloudflare Durable Object local data は CLI で直接投入するのではなく、DO instance を作って method を呼ぶ必要がある。canonical Turso-like data は local fixture binding または explicit seed endpoint/script で初期化する必要がある。

### 制約

- seed は local verification data であり、product runtime policy ではない。
- seed data に real workspace/user/secret を置かない。
- reset は `.wrangler/state` 削除に依存してよいが、script は destructive target を repo root 外へ広げない。

### 実装メモ

- local smoke 用 canonical SQL fixture client を用意するか、local Turso-compatible file DB を使うかを決める。
- DO-local Agent storage は local-only initialization RPC で schema/table を作る。
- seed/reset は idempotent にする。
- local data setup が失敗した場合、smoke は route failure ではなく setup failure として出す。

### 完了条件

- local smoke 前に canonical note fixture と Agent-local tables が準備される。
- repeated smoke run が stale local state に依存しない。
- local data directory が git status に出ない。

### Status notes, canonical fixture slice 2026-05-19

- Added a test-only local canonical Turso-like fixture client under `tests/fixtures`, not product runtime code.
- The canonical seed/reset planner clears canonical tables in deterministic child-to-parent order, then reseeds the canonical Note / Section / Block fixture through the existing Note document SQL mapper.
- Seed/reset is idempotent and excludes `agent_local_*` tables, auth secrets, and tracked deployment/runtime values.
- Remaining LCWA-06 work: DO-local Agent storage seed/reset is tracked separately; this slice owns only canonical fixture persistence.

### Status notes, DO-local schema init/reset slice 2026-05-19

- Added a local verification-only `applyAgentLocalSchemaCommand` RPC method on both deployable `NoteAgent` and `WorkspaceBrainAgent`.
- The public command/result DTO is serializable only: `{ action: "initialize" | "reset", purpose: "local_verification" }` returns initialized/dropped Agent-local table names and stable errors.
- Execution is gated by `LOCAL_AGENT_SMOKE_ENABLED=1`; when disabled, the method returns a stable rejection without touching Durable Object SQL.
- Schema SQL lives in `apps/worker/src/durableObjectAgentLocalSchema.ts`, not in the Durable Object adapter. It creates/resets only `agent_local_*` temporary tables used by scheduler, work queue, digest, and audit recovery adapters. Canonical `notes`, `sections`, `blocks`, memory, semantic, and audit tables are intentionally excluded.

### Status notes, integrated local seed/reset slice 2026-05-19

- Added local-only Worker routes `/__local/smoke/reset` and `/__local/smoke/seed` behind `LOCAL_AGENT_SMOKE_ENABLED=1`.
- The seed route stores canonical fixture data in a local verification-only in-memory document/digest port, calls `NoteAgent.applyAgentLocalSchemaCommand`, calls `WorkspaceBrainAgent.applyAgentLocalSchemaCommand`, and injects a NoteAgent scheduler snapshot through `NoteAgent.applyLocalSmokeSchedulerSnapshot`.
- `wrangler.toml` now routes `/__local/*` through the Worker script so the local verification routes reach the Worker before static assets.
- The smoke script now prepares reset/seed before product route checks and starts spawned Wrangler with local verification enabled and the operator-supplied smoke auth secret as runtime env. For `WORKER_LOCAL_URL`, the already-running Worker must provide equivalent env.

### 検証コマンド

- `node --test tests/contracts/worker-schema-readiness.test.mjs tests/contracts/worker-agent-local-schema-readiness.test.mjs`
- `npm run worker:local:smoke` または実装後の同等コマンド
- `git status --short`

### 想定変更ファイル

- `scripts/smoke-worker-local-runtime.mjs`
- `tests/fixtures/worker-canonical-schema-fixture.mjs`
- `tests/fixtures/worker-agent-local-schema-fixture.mjs`
- `apps/worker/src/cloudflareDurableObjectAgents.ts`

## Issue LCWA-07: Real local HTTP smoke / curl lane

### 目的

実 HTTP で local Worker に request を送り、Worker HTTP -> Agent RPC -> persistence/provider/runtime ports の通信が通ることを repo-owned に検証する。

### コンテキスト

現在は in-process `backend-runtime-smoke.test.mjs` がある。次は local workerd/wrangler process に対する real HTTP smoke を追加する。

### 制約

- smoke は UI/browser を要求しない。
- smoke は local values を shell env / `.dev.vars` / runtime harness から注入し、repo-tracked config に戻さない。
- smoke は provider SDK や real remote AI を要求しない。local fake provider registry は dev/test seam に閉じる。

### 実装メモ

- script が local dev server を起動する場合、port readiness wait、timeout、child process cleanup を実装する。
- request set:
  - `GET /notes/:noteId`
  - `PATCH /blocks/:blockId`
  - `POST /notes/:noteId/leave`
  - `POST /notes/:noteId/structure/manual`
  - local-only WorkspaceBrain process trigger
  - `GET /notes/:noteId/digest`
  - invalid auth
- smoke output に status と bounded response body を出し、同じ request を curl で再現できる形にする。
- local Cloudflare runtime が使えない環境では skip ではなく setup failure として分かる message を出す。ただし CI で optional lane にする場合は contract にその扱いを明記する。

### 完了条件

- `npm run worker:local:smoke` が local Worker/Agents 通信を実 HTTP で検証する。
- NoteAgent / WorkspaceBrainAgent RPC call が少なくとも 1 回ずつ観測される。
- smoke 結果から curl command を人間が再実行できる。

### Status notes, tooling/smoke slice 2026-05-19

- Added `scripts/smoke-worker-local-runtime.mjs` to validate real HTTP status/body for `GET /notes/:noteId`, `PATCH /blocks/:blockId`, `POST /notes/:noteId/leave`, `POST /notes/:noteId/structure/manual`, `GET /notes/:noteId/digest`, and invalid auth. It prints bounded response bodies and curl-equivalent commands using environment-variable references instead of echoing secret values into tracked files.
- Smoke inputs are operator-supplied through env: `WORKER_SMOKE_WORKSPACE_ID`, `WORKER_SMOKE_USER_ID`, `WORKER_SMOKE_AUTH_SECRET`, `WORKER_SMOKE_NOTE_ID`, `WORKER_SMOKE_BLOCK_ID`, and optionally `WORKER_LOCAL_URL`, `WORKER_LOCAL_PORT`, `WORKER_LOCAL_PERSIST_TO`.
- WorkspaceBrainAgent real HTTP validation now defaults to the local-only `/__local/agents/workspace/process` trigger added in LCWA-05. `WORKER_SMOKE_WORKSPACE_BRAIN_PATH` may override the path for an already-running local Worker, but the default path is repo-owned.
- Local seed/reset now runs before product route checks. Failures to reset/seed canonical fixture state, initialize Agent-local DO schema, or inject the NoteAgent scheduler snapshot are reported as setup failures rather than silently skipped.

### 検証コマンド

- `npm run worker:local:smoke`
- `node --test tests/contracts/backend-runtime-smoke.test.mjs tests/contracts/worker-entrypoint.test.mjs tests/contracts/worker-cloudflare-agent-bindings.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### 想定変更ファイル

- `scripts/smoke-worker-local-runtime.mjs`
- `package.json`
- `docs/contracts/verification-lanes.md`
- `tests/contracts/hosted-note-surface-e2e.test.mjs` は原則触らない

## Issue LCWA-08: Contract/register/review closure

### 目的

LCWA-01〜07 の実装後、DDD / bounded context / runtime topology / local Cloudflare verification の観点でレビューし、修正箇所がなくなるまで繰り返す。

### コンテキスト

この phase は UI 実装前の backend/runtime verification gate である。local Cloudflare Agents が通っていない状態で UI polish に進まない。

### 制約

- 修正が必要な契約は `docs/contracts/**` に反映する。
- record / generated register は stale にしない。
- レビューは runtime adapter と domain/application owner の責務混在を重点的に見る。

### 実装メモ

- 独立 review subagent に次を依頼する:
  - Worker/Agent RPC boundary が serializable DTO に閉じているか。
  - Durable Object adapter が policy owner になっていないか。
  - Agent-local SQL と canonical Turso-like persistence が混ざっていないか。
  - local-only trigger が product API scope を広げていないか。
  - HTTP smoke が UI/browser に依存していないか。
- findings があれば blocking / non-blocking に分け、blocking は修正して再レビューする。

### 完了条件

- blocking finding なし。
- `docs/contracts/verification-lanes.md` に local Cloudflare Agents smoke lane が記録される。
- `docs/generated/register.md` が current。
- full verification と local smoke が pass。

### 検証コマンド

- `npm run worker:local:smoke`
- `npm run verify`
- `npm run docs:register:check`
- `git diff --check`

### 想定変更ファイル

- `docs/contracts/backend-runtime.md`
- `docs/contracts/cloudflare-agents-turso.md`
- `docs/contracts/verification-lanes.md`
- `docs/generated/register.md`
- `docs/records/local-cloudworker-agents-issues-2026-05-19.md`

## 推奨実装順

1. LCWA-01 と LCWA-02 を並列で進める。
2. LCWA-03 を入れて、DO-local Agent SQL と既存 Agent-local adapters の接続を固定する。
3. LCWA-04 で product structure routes を NoteAgent RPC 経由にする。
4. LCWA-05 で WorkspaceBrainAgent local trigger を追加する。
5. LCWA-06 で local data seed/reset を deterministic にする。
6. LCWA-07 で real local HTTP smoke を追加する。
7. LCWA-08 で独立レビュー、修正、契約/register 更新、full verification を行う。

## サブエージェント分担

- tooling subagent: LCWA-01。`package.json` / scripts だけを主に扱う。
- runtime boundary subagent: LCWA-02。env/stub/RPC boundary と tests を担当する。
- Agent-local persistence subagent: LCWA-03。DO-local SQL executor と Agent-local adapters を担当する。
- NoteAgent routing subagent: LCWA-04。HTTP structure route から NoteAgent RPC への接続を担当する。
- WorkspaceBrain routing subagent: LCWA-05。local-only process trigger と WorkspaceBrain RPC を担当する。
- local data subagent: LCWA-06。seed/reset と fixture readiness を担当する。
- smoke subagent: LCWA-07。real HTTP smoke script と verification lane を担当する。
- parent/reviewer: LCWA-08。統合、DDD/境界レビュー、blocking finding 修正確認、docs/register 更新を担当する。

## 未決定事項

- wrangler を devDependency として repo に固定するか、`npx wrangler` の外部 tool 前提にするか。Tooling/smoke slice decision: use an installed external `wrangler` executable and fail clearly when absent; revisit dependency pinning only if the repo later chooses to own CLI version installation.
- local canonical persistence を Turso-compatible in-memory fixture clientにするか、local file DB / remote Turso binding にするか。Decision 2026-05-19: use the local verification-only in-memory fixture for this smoke lane; revisit file DB / remote Turso only when the repo chooses to own a persistent local canonical DB.
- WorkspaceBrain process trigger を local-only HTTP route にするか、scheduled/test trigger にするか。Decision 2026-05-19: use local-only HTTP path `/__local/agents/workspace/process`, gated by `LOCAL_AGENT_SMOKE_ENABLED=1`, normal auth/workspace normalization, and userId.
- local smoke lane を standard `npm run verify` に含めるか、Cloudflare runtime optional lane として分離するか。Tooling/smoke slice decision: keep `npm run worker:local:smoke` separate from standard `npm run verify`; failures are explicit setup/blocker/smoke failures, not skips.
