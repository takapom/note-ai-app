# 検証エージェント

サブエージェント概要。これは 信頼できる唯一の情報源 ではない。

## 目的

tests、generated register checks、レビュー自動化を追加する。

## 必読

- `docs/contracts/verification-lanes.md`
- `docs/contracts/mvp-acceptance.md`
- `docs/contracts/non-functional-requirements.md`
- `docs/contracts/api-events.md`

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
