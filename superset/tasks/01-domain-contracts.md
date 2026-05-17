# Superset タスク: live TypeScript ドメイン契約を実装する

## 目的

Note / Section / Block / InlineSpan / Annotation の live contract、description precedence helper、section boundary helper、implicit stable chunk helper、tests/fixtures を追加します。

## オーナー契約

`docs/contracts/app-note-model.md`

## 検証レーン

`note_model`

## コンテキスト

- `AGENTS.md` を読んでください。
- オーナー契約を読んでください。
- オーナー契約で指定されている付随契約を読んでください。
- `docs/contracts/data-model.md` を読んでください。

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
- `contexts/note-model/src/contract/noteContract.ts` を live product semantics として更新してください。
- `contexts/note-model/src/contract/noteFixtures.ts` に最小 fixture を置いてください。
- User block type と AI block type を分離し、origin の制約を helper/test で固定してください。
- heading がない note では implicit section / stable chunk を作る helper を追加してください。
- UI、runtime、AI、memory、security に触れる場合は `docs/contracts/non-functional-requirements.md` も確認してください。
- MVP 完了に関係する場合は `docs/contracts/mvp-acceptance.md` の該当項目を確認してください。

## 完了条件

- 実装またはドキュメント変更がオーナー契約と一致している。
- 検証レーンに対応するテスト/チェックが追加または更新されている。
- description precedence、heading boundary、implicit chunk、origin/type separation がテストされている。
- リポジトリが scaffold 済みであれば typecheck/lint/test が通る。
- 最終サマリーに変更ファイル、リスク、フォローアップが記載されている。

## 検証

- `tsc -p tsconfig.json --noEmit`
- `node --test tests/**/*.test.mjs`
- `node scripts/verify-contracts.mjs --lint`
- `node scripts/generate-doc-register.mjs --check`

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
