# MVP スコープ契約

ドキュメント種別: contract  
権威: MVP 境界の信頼できる唯一の情報源  
オーナー: product オーナー  
付随契約: product-principles.md, mvp-acceptance.md, verification-lanes.md  
生成済み companion: docs/generated/register.md  
検証レーン: MVP scope review lane  
ステータス: active

## 目的

MVP に含まれるものと除外されるものを正確に定義する。

## この契約が所有するもの


MVP に含まれるもの:
- 統一ノートサーフェス。
- アプリ固有の Block / Section document model。
- note ごとの title と description。
- H1/H2/H3 section boundary semantics。
- AI Assist Block。
- Memory candidate block。
- Note close / tab switch / app leave structuring trigger。
- Dirty section tracking。
- Context Assembly。
- Manual organize action。
- AI 操作スキーマ。
- 操作ルーター。
- 次回オープンダイジェスト。
- Source spans / provenance。
- hidden autonomous memory ではなく Memory candidates。
- Cloudflare Agents SDK based backend runtime。
- Worker + AI SDK。
- Turso canonical DB。
- Codex / Superset 開発運用 contract。


## この契約が所有しないもの


MVP から除外されるもの:
- External integrations。
- primary UI としての Graph view。
- Team collaboration。
- Notion-style database views。
- kanban/calendar/table database view。
- 複雑な property system。
- AI モード切り替え。
- Persistent AI chat panel。
- 毎 keystroke AI structuring。
- Markdown を内部 SoT にすること。
- AI による user text の rewrite。


## 不変条件


- MVP は core loop を実証しなければならない: write -> leave note -> background structure -> next open digest -> editable AI assist blocks.
- MVP への追加はすべて、この loop を直接支援しなければならない。
- Future candidates は Google Docs export、Google Calendar action candidate、Slack action candidate、Graph/cluster view、Memory dashboard、Team workspace、External content ingestion であり、MVP scope ではない。
- 外部連携は第一思想ではなく、整理された思考を外へ運ぶための extension として扱う。


## 許可されるトポロジー

MVP scope は、新しい contract が改訂するまで、すべての Superset tasks を制約する。

## 移行用の seam

除外された MVP features には compatibility seam を設けない。

## 削除対象

除外された features を実装する MVP tasks を削除する。

## ガード / 検証

Superset task creation は tasks を MVP コア、MVP support、post-MVP に分類しなければならない。
