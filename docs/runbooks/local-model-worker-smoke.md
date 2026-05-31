# Local Model Worker Smoke Runbook

ドキュメント種別: ランブック。

## 目的

ローカルの Worker / Agent runtime で、local model provider を使って背景 AI 構造化を実 HTTP smoke として実行する。

## 前提

- `npm install` が完了している。
- Docker が利用できる。
- `wrangler` は repo の devDependency または `WRANGLER_BIN` で実行できる。

## 手順

1. Ollama runtime を起動する。

```bash
docker compose -f compose.local-model.yml up -d ollama
```

2. smoke で使う model を pull する。

```bash
OLLAMA_MODEL=llama3.2:3b docker compose -f compose.local-model.yml --profile pull run --rm ollama-pull
```

3. Worker smoke の入力を設定する。

```bash
export WORKER_SMOKE_WORKSPACE_ID='workspace_local_smoke'
export WORKER_SMOKE_USER_ID='user_local_smoke'
export WORKER_SMOKE_AUTH_SECRET='local_smoke_secret'
export WORKER_SMOKE_NOTE_ID='note_local_smoke'
export WORKER_SMOKE_BLOCK_ID='block_local_smoke'
export WORKER_LOCAL_MODEL_PROTOCOL='ollama'
export WORKER_LOCAL_MODEL_BASE_URL='http://127.0.0.1:11434'
export WORKER_LOCAL_MODEL_NAME='llama3.2:3b'
export WORKER_LOCAL_PERSIST_TO="/private/tmp/ai-native-note-worker-smoke-state-$(date +%s)"
```

4. smoke を実行する。

```bash
npm run worker:local:smoke
```

成功時は `local Worker HTTP smoke passed` が表示される。WorkspaceBrain process trigger の body には non-empty `scheduledJobIds`, `providerCalls`, `operationRoutingCalls`, `auditWrites` と empty `noteSotMutations` が含まれる。

## UI プレビューで確認する

`preview:ui` は local preview 用の note / block ID と local model 設定を Wrangler に渡す。env を指定しない場合は `ollama`, `http://127.0.0.1:11434`, `llama3.2:3b` を使う。

```bash
npm run preview:ui
```

表示された `Open:` URL を開き、画面上部の `整理` を押す。local preview の debug-only panel に `providerCalls`, `operationRoutingCalls`, `auditWritesSavedCount`, `noteSotMutations` が表示される。完了条件は provider / Operation Router / audit が 1 件以上、`noteSotMutations` が 0 件である。

## 切り分け

- `setup failure`: Docker / Ollama / Wrangler / 必須 env を確認する。
- `blocked`: local-only WorkspaceBrain trigger、local model 応答、Agent-local queue、audit write のどこかが背景処理完了条件に届いていない。
- `smoke failure`: public Worker route の HTTP/API contract が壊れている。
