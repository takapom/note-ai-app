# Web App UI サーフェス契約

ドキュメント種別: オーナーローカルの UI/プロダクトポリシー。権威: `docs/contracts/frontend-ui.md`、`docs/contracts/unified-note-surface.md`、`docs/contracts/non-functional-requirements.md`。

## ローカルで所有するもの

- 統一ノートサーフェスの Web コンポーネント配置。
- AI Assist Blocks のレンダリング。
- 次回オープンダイジェストコンポーネントのふるまい。
- Provenance popover の配置。
- Note Header の title / description 表示。
- Manual Organize の command palette entry。

## 所有してはいけないもの

- ドキュメントセマンティクス。
- AI 操作スキーマ。
- Memory セマンティクス。
- ランタイムスケジューリング。

## ローカル不変条件

- MVP に永続的な AI チャットパネルを追加しないでください。
- MVP に AI モード切り替えを追加しないでください。
- NoteSurface view model は Note Model semantics を所有せず、`contexts/note-model` の document validation を消費してください。
- AI Assist Blocks は、独立した AI パネルではなく block renderer によってレンダリングされます。
- バックグラウンド構造化中も、執筆フローは応答性を保たなければなりません。
- AI Assist Block 挿入はカーソル位置を奪ってはなりません。
- 入力中に AI 由来の layout shift を発生させてはいけません。
- Memory candidate block はノート内で承認/拒否できなければなりません。
