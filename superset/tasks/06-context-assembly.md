# Superset タスク: コンテキスト組み立てエンベロープを実装する

## ステータス

implemented

## 目的

title、description、outline、related units、active memory を使って、境界づけられた context envelope を構築します。

## オーナー契約

`docs/contracts/context-assembly.md`

## 検証レーン

`context`

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

- `contexts/context-assembly/src/contract/contextEnvelopeContract.ts` が context envelope live contract、K limits、budget shares、assembly / validation helper、untrusted content boundary を実装済みです。
- `contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts` が contract fixture を提供しています。
- `tests/contracts/context-assembly-runtime.test.mjs` が description priority、K limits、memory filtering、forbidden dumps、fixed constraints、untrusted boundary、partial envelope validation、memory source provenance を検証済みです。

## 完了条件

- 実装は `docs/contracts/context-assembly.md` と付随契約に一致してレビュー済みです。
- context assembly runtime tests が追加済みです。
- validator 例外化の追加レビュー指摘は修正済みです。
- typecheck、runtime tests、contract lint、docs register check は通過確認済みです。

## 検証

- `tsc -p tsconfig.json --noEmit` 通過確認済み。
- `node --test tests/**/*.test.mjs` 通過確認済み（33 tests pass）。
- `node scripts/verify-contracts.mjs --lint` 通過確認済み。
- `node scripts/generate-doc-register.mjs --check` 通過確認済み。

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
