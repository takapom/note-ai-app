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
- AI Assist / Memory candidate actions は user intent と API intent の model に留め、provider call や user-authored block の直接 mutation を持たせないでください。
- API intent mapping は dependency-free request descriptor に留め、Worker 実装、generated OpenAPI、provider call、auth policy を import しないでください。
- Memory edit / delete / snooze API intents は Worker request descriptor だけを作り、snooze は backend domain action の hold route に対応付けてください。
- Next Open Digest は compact / expandable にし、missing digest から fake content を作らないでください。
- Provenance popover は bounded excerpt と source metadata だけを持ち、full note / full workspace dump を持たせないでください。
- バックグラウンド構造化中も、執筆フローは応答性を保たなければなりません。
- AI Assist Block 挿入はカーソル位置を奪ってはなりません。
- 入力中に AI 由来の layout shift を発生させてはいけません。
- Memory candidate block はノート内で承認/拒否できなければなりません。
