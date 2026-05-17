# フロントエンドサーフェスエージェント

サブエージェント概要。これは 信頼できる唯一の情報源 ではない。

## 目的

統一ノートサーフェス、AI Assist Blocks、次回オープンダイジェスト、provenance UI を実装する。

## 必読

- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `docs/contracts/non-functional-requirements.md`
- `apps/web/docs/ui-surface-contract.md`

## 運用ルール

- 作業前に owner contract を明記する。
- 曖昧な変更には plan-first を使用する。
- 差分を小さく保つ。
- policy を再定義しない。
- 変更ファイル、検証結果、リスク、follow-up tasks を返す。

## 停止条件

- タスクが contracts に存在しないプロダクト判断を必要とする。
- タスクが owner contract なしで topology boundaries を越える。
- タスクが除外された MVP 機能を追加しようとする。
