# Superset タスク: AI 操作スキーマを実装する

## 目的

source span、confidence、安全でない rewrite の拒否を備えた operation schema を実装します。

## ステータス

implemented

実装は `contexts/ai-operations/src/contract/operationContract.ts` と `contexts/ai-operations/src/contract/operationFixtures.ts` に存在し、operation lane の runtime tests は通過しています。

scaffold 済みリポジトリの完了条件に含まれる direct validation は通過しているため、この task は register 上で implemented と扱います。

## オーナー契約

`docs/contracts/operation-return-contract.md`

## 検証レーン

`operation`

## コンテキスト

- `AGENTS.md` を読んでください。
- オーナー契約を読んでください。
- オーナー契約で指定されている付随契約を読んでください。

## 制約

- 差分を小さく保ってください。
- MVP スコープを広げないでください。
- 外部連携を追加しないでください。
- 永続的な AI チャットパネルを追加しないでください。
- AI モード切り替えを追加しないでください。
- キー入力ごとに AI 構造化を実行しないでください。
- README/guides/issues/PRs でポリシーを再定義しないでください。

## 実装メモ

- 要件入力文書ではなく、オーナー契約と付随契約を実装判断の SoT としてください。
- UI、runtime、AI、memory、security に触れる場合は `docs/contracts/non-functional-requirements.md` も確認してください。
- MVP 完了に関係する場合は `docs/contracts/mvp-acceptance.md` の該当項目を確認してください。

## 実装結果

- 許可 operation は `create_semantic_unit`, `create_relation`, `create_memory_candidate`, `insert_assist_block`, `mark_stale`, `no_op` として live contract に定義されています。
- 禁止 operation は `rewrite_user_block`, `send_external_message`, `create_external_event`, `delete_user_block`, `modify_user_block_without_review` として MVP operation union から除外され、validation で blocked になります。
- visible または memory-affecting operation は `sourceSpans` と `confidence` を要求します。
- `validateOperationList` は AI response が operation list であることを検証します。
- `classifyOperationPolicy` は `silent`, `inline`, `review`, `blocked` に分類します。
- `shouldApplyOperation` は threshold 未満の low-confidence operation を apply しません。
- fixtures は全 MVP operation の valid case と forbidden rewrite case を持ちます。
- `tests/contracts/operation-schema-runtime.test.mjs` は fixture validation、policy classification、unknown/forbidden rejection、source span/confidence requirement、operation list validation、low-confidence no-apply を検証します。

## 完了条件

- 実装またはドキュメント変更がオーナー契約と一致している。
- 検証レーンに対応するテスト/チェックが追加または更新されている。
- リポジトリが scaffold 済みであれば typecheck/lint/test が通る。
- 最終サマリーに変更ファイル、リスク、フォローアップが記載されている。

## 検証

- `tsc -p tsconfig.json --noEmit`: pass
- `node --test tests/**/*.test.mjs`: pass
- `node -e "JSON.parse(require('fs').readFileSync('docs/generated/superset-task-register.example.json','utf8')); console.log('task register json valid')"`: pass
- `node scripts/generate-doc-register.mjs --check`: pass
- `node scripts/verify-contracts.mjs --lint`: pass

`npm run typecheck`, `npm run lint`, and `npm run test` wrappers were not executable in this sandbox because the approval policy rejected them; the direct commands from `docs/contracts/verification-lanes.md` were used instead.

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
