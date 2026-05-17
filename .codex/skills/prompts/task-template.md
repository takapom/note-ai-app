# Codex タスクテンプレート

Superset/Codex task ではこの template を使う。

## 目的

<何を変更するか?>

## コンテキスト

- `AGENTS.md` を読む。
- 関連する contract を読む:
  - `docs/contracts/...`
- 関連ファイル:
  - `<path>`

## 制約

- diff を小さく保つ。
- MVP scope を広げない。
- 対応する contract を更新せずに policy を変更しない。
- user-authored blocks が source of truth である。
- AI は free-form structural output ではなく operations を返す。
- AI structuring を keystroke ごとに実行しない。
- external integrations を追加しない。

## 完了条件

- <具体的な behavior が存在する>
- tests が追加または更新されている。
- typecheck/lint/test commands が通る。
- final summary に changed files、risks、follow-ups が記載されている。

## 検証

- `npm run typecheck`
- `npm run lint`
- `npm run test`
