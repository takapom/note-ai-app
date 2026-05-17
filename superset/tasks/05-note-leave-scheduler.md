# Superset タスク: ノート離脱時の構造化スケジューリングを実装する

## ステータス

implemented

## 目的

dirty sections を追跡し、ノートを閉じる、タブを切り替える、アプリを離れるタイミングで structure jobs を作成します。

## オーナー契約

`docs/contracts/ai-structuring-lifecycle.md`

## 検証レーン

`scheduler`

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

## 実装確認

- `contexts/scheduler/src/contract/structureSchedulerContract.ts` に live contract helper を実装済み。
- `contexts/scheduler/src/contract/structureSchedulerFixtures.ts` に scheduler runtime fixtures を追加済み。
- `tests/contracts/structure-scheduler-runtime.test.mjs` に BlockChanged、leave triggers、next_open recovery、manual organize、whole note guard、dedupe、invalid runtime input guard の runtime tests を追加済み。
- `tests/contracts/live-contracts.test.mjs` に scheduler helper の live contract 確認を追加済み。

## 完了条件

- 実装は `docs/contracts/ai-structuring-lifecycle.md` と付随契約に一致している。
- scheduler live contract と runtime tests が追加済み。
- `planStructureJobs` は invalid runtime input を no-job + error として扱う。
- direct verification がレビュー側で通過確認済み。

## 検証

- `tsc -p tsconfig.json --noEmit` 通過確認済み。
- `node --test tests/**/*.test.mjs` 通過確認済み（43 tests pass）。
- `node scripts/verify-contracts.mjs --lint` 通過確認済み。
- `node scripts/generate-doc-register.mjs --check` 通過確認済み。

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
