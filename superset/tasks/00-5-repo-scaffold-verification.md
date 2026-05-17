# Superset タスク: repo scaffold と検証レーン具体化

## 目的

npm workspace、TypeScript typecheck、node:test、docs register check、contract verification script を追加し、以降の実装タスクが同じ検証コマンドで進められるようにします。

## オーナー契約

`docs/contracts/repository-topology.md`

## 検証レーン

`contract,note_model`

## コンテキスト

- `AGENTS.md` を読んでください。
- `docs/contracts/repository-topology.md` を読んでください。
- `docs/contracts/verification-lanes.md` を読んでください。
- `docs/contracts/superset-codex-workflow.md` を読んでください。
- `docs/guides/implementation-readiness-guide.md` を読んでください。

## 制約

- MVP スコープを広げないでください。
- UI、runtime provider、database migration の本実装は行わないでください。
- live TypeScript contract は contracts の projection として扱ってください。
- generated register は policy にしないでください。

## 実装メモ

- package manager は npm workspaces を最小 scaffold として採用します。
- TypeScript は `contexts/**/*.ts` の live contract を typecheck します。
- unit tests は node:test で開始し、外部 test framework はまだ導入しません。
- `npm run ...` が sandbox で拒否される場合、直接コマンドで検証します。

## 完了条件

- `package.json` と `tsconfig.json` が存在する。
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run verify` が定義されている。
- docs register check が stale register を検出できる。
- contract verification script が contract header と live contract authority を検証できる。
- 最小 node:test が live contract の主要 invariant を確認する。

## 検証

- `tsc -p tsconfig.json --noEmit`
- `node scripts/verify-contracts.mjs --lint`
- `node --test tests/**/*.test.mjs`
- `node scripts/generate-doc-register.mjs --check`

## 推奨 Codex プロンプト

このタスクは scaffold なので plan-first 後に実装してください。MVP product behavior は実装しないでください。
