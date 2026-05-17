# Superset タスク: 統一ノートサーフェスのスケルトンを実装する

## 目的

blocks と inline AI Assist Block fixtures を備えた editor shell を構築します。

## オーナー契約

`docs/contracts/frontend-ui.md`

## 検証レーン

`frontend`

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

## 完了条件

- 実装またはドキュメント変更がオーナー契約と一致している。
- 検証レーンに対応するテスト/チェックが追加または更新されている。
- リポジトリが scaffold 済みであれば typecheck/lint/test が通る。
- 最終サマリーに変更ファイル、リスク、フォローアップが記載されている。

## 検証

- 検証レーンに対応するチェックを実行または not-yet-available として明示してください。
- scaffold 済みであれば typecheck/lint/test を実行してください。

## 推奨 Codex プロンプト

実装が複数レイヤーに触れる場合は、plan-first を使ってください。
