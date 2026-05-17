# Superset タスク: 操作ルーターを実装する

## 目的

operation を検証し、semantic units、assist blocks、メモリ候補 を安全に適用します。

## ステータス

implemented

Operation Router 実装と router runtime tests は追加済みで、direct verification 済みです。

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

## 現在の実装確認

- `validateOperationList` は AI response が operation list であることを検証します。
- `validateStructureOperation` は unknown/forbidden operation、source spans、confidence、position などの schema-level rejection を扱います。
- `classifyOperationPolicy` は `silent`, `inline`, `review`, `blocked` の policy decision を返します。
- `shouldApplyOperation` は default threshold `0.5` 未満の low-confidence operation を apply 対象外にします。
- `contexts/ai-operations/src/contract/operationRouterContract.ts` は validated operation を target existence check、audit record、safe apply、apply result に接続します。
- `contexts/ai-operations/src/contract/operationRouterFixtures.ts` は router runtime tests の fixtures を提供します。
- `tests/contracts/operation-router-runtime.test.mjs` は router accept/reject/revert behavior を検証します。

## 完了条件

- Operation Router が schema validation、target existence check、confidence threshold、policy decision、`ai_operations` audit record、safe apply、apply result を担当していることを確認済み。
- `blocked` operation は適用されず、audit record と rejected/blocked result を残すことを確認済み。
- low-confidence operation は適用されず、契約に従って rejected または `no_op` result になることを確認済み。
- explicit `no_op` は user text や projection を変更せず、reason を含む audit/result として扱われることを確認済み。
- operation lane に対応する router accept/reject/revert tests が追加済み。
- typecheck/lint/test/doc register check は direct verification で通過済み。
- 最終サマリーに変更ファイル、リスク、フォローアップが記載されている。

## 検証

- `tsc -p tsconfig.json --noEmit` passed by reviewer direct verification.
- `node --test tests/**/*.test.mjs` passed by reviewer direct verification.
- `node scripts/verify-contracts.mjs --lint` passed by reviewer direct verification.
- `node scripts/generate-doc-register.mjs --check` passed by reviewer direct verification.
- `node -e "JSON.parse(require('fs').readFileSync('docs/generated/superset-task-register.example.json','utf8')); console.log('task register json valid')"`

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
