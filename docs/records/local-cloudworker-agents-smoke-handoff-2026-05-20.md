# Local CloudWorker Agents smoke handoff

ドキュメント種別: record  
作成日: 2026-05-20  
目的: Cloudflare local runtime 上で `npm run worker:local:smoke` を実行確認する担当者へ、必要条件、実行手順、期待結果、失敗時の切り分けを引き継ぐ。  
関連契約: `docs/contracts/verification-lanes.md`, `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md`  
関連 record: `docs/records/local-cloudworker-agents-issues-2026-05-19.md`

## 現在の状態

LCWA-01〜08 の実装、契約 lint、generated register check、typecheck、full Node test は完了済み。

この handoff は `docs/records/local-cloudworker-agents-issues-2026-05-19.md` の LCWA-08 closure により完了済み。実 Cloudflare local runtime / Wrangler / workerd を使った以下の lane は 2026-05-20 に Wrangler 4.93.0 と fresh local persistence path で pass した。

```sh
npm run worker:local:smoke
```

この lane は `npm run verify` には含めない optional runtime lane。Wrangler 未導入、local env 不足、local-only trigger 不足は skip ではなく setup / blocker failure として扱う。

## 事前条件

- repo-local devDependency の Cloudflare Wrangler CLI が実行可能であること。通常は `npm install` 後に `npm run worker:local:smoke` / `npm run worker:local` から使う。
- local Worker が Durable Object bindings を使えること。
- repo-tracked config に local secret / workspace / user / fixture 値を追加しないこと。
- `.wrangler/state` や `.dev.vars` は commit しないこと。

Wrangler を script から起動する場合、`WORKER_LOCAL_URL` は unset にする。既に起動済みの local Worker に向ける場合だけ `WORKER_LOCAL_URL` を指定する。

## 必須 env

```sh
export WORKER_SMOKE_WORKSPACE_ID='workspace_local_smoke'
export WORKER_SMOKE_USER_ID='user_local_smoke'
export WORKER_SMOKE_AUTH_SECRET='local_smoke_secret'
export WORKER_SMOKE_NOTE_ID='note_local_smoke'
export WORKER_SMOKE_BLOCK_ID='block_local_smoke'
```

値は任意の local 検証値でよい。実 tenant / 実 user / 実 secret を使わない。

## 任意 env

```sh
export WORKER_LOCAL_PORT='8787'
export WORKER_LOCAL_PERSIST_TO='.wrangler/state'
export WORKER_SMOKE_WORKSPACE_BRAIN_PATH='/__local/agents/workspace/process'
```

既に local Worker を起動済みの場合:

```sh
export WORKER_LOCAL_URL='http://127.0.0.1:8787'
```

この場合、起動済み Worker 側でも `LOCAL_AGENT_SMOKE_ENABLED=1` と auth secret 相当の env が有効である必要がある。

## 実行

Wrangler を script に起動させる標準確認:

```sh
npm run worker:local:smoke
```

既に起動済み Worker へ向ける確認:

```sh
WORKER_LOCAL_URL='http://127.0.0.1:8787' npm run worker:local:smoke
```

起動だけ確認したい場合:

```sh
npm run worker:local
```

## 期待する観測

script は最初に local verification setup を行う。

- `POST /__local/smoke/reset`
- `POST /__local/smoke/seed`

その後、実 HTTP で product route と local-only trigger を確認する。

- `GET /notes/:noteId`
- `PATCH /blocks/:blockId`
- `POST /notes/:noteId/leave`
- `POST /notes/:noteId/structure/manual`
- `GET /notes/:noteId/digest`
- invalid auth request
- `POST /__local/agents/workspace/process`

成功時は `local Worker HTTP smoke passed` が表示される。各 request について status、bounded body、curl-equivalent command が出る。

## 失敗分類

- `setup failure`: Wrangler 不足、env 不足、local seed/reset 失敗、seed/reset response body 不正。
- `blocked`: local-only WorkspaceBrain trigger が使えない、または equivalent local Worker env / binding が不足。
- `smoke failure`: product route の status/body が期待と異なる。
- `unexpected failure`: script 自体の未分類エラー。

## 実行後に更新する場所

成功したら次を更新する。

- `docs/records/local-cloudworker-agents-issues-2026-05-19.md`
  - LCWA-08 に `npm run worker:local:smoke` の実行日、実行環境、結果を追記する。
- 必要ならこの handoff record
  - 追加で分かった local setup 条件や operator 手順を追記する。
- `docs/generated/register.md`
  - record を変更した場合は `node scripts/generate-doc-register.mjs` を実行して更新し、`node scripts/generate-doc-register.mjs --check` で確認する。

## 注意

- `wrangler.toml`、public HTML、generated docs に runtime 値や secret を書かない。
- local-only `/__local/*` path は product API surface ではない。
- Agent-local SQL は `agent_local_*` temporary state のみ。canonical Note / Section / Block SoT は local smoke setup でも直接 AI path から mutate しない。
