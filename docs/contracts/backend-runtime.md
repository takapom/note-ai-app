# バックエンドランタイム契約

ドキュメント種別: contract  
権威: backend responsibility boundaries の信頼できる唯一の情報源  
オーナー: runtime オーナー  
付随契約: cloudflare-agents-turso.md, vendor-lock-avoidance.md, api-events.md, data-model.md  
生成済み companion: apps/worker/docs/runtime-contract.md  
検証レーン: runtime topology レビューレーン  
ステータス: active

## 目的

product ownership を runtime code に漏らさず、Worker/API/Agent の責務を定義する。

## この契約が所有するもの


- Worker の責務。
- Runtime adapter boundaries。
- API routing の期待値。
- UI/backend event flow。
- runtime は product semantics を所有しないというルール。


## この契約が所有しないもの


- Note model semantics。
- UI policy。
- AI 操作スキーマ。


## 不変条件


- Worker は HTTP、auth、routing、Turso access、Agent routing、AI SDK provider setup を扱う。
- Worker は contexts/contracts に属する product decisions を直接実装しない。
- Runtime modules は ad-hoc parsing ではなく context contracts と operation router を呼び出す。
- Runtime は `api-events.md` の event flow を実装し、UI event から AI provider または Turso への直接ショートカットを作らない。
- Runtime は note leave、manual organize、next open の API を scheduler/Agents にルーティングする。
- Runtime orchestration boundary は completed StructureJob の AI response だけを operation routing に渡す。non-completed job と provider failure は Note/Block source of truth を変更せず、Operation Router を呼び出さない。
- Runtime は AI response に stable operation audit IDs を付与し、Operation Router を経由してから audit persistence port へ渡す。
- Runtime persistence port は Operation Router の policy/status を再分類せず、storage shape validation と infrastructure error handling のみを担当する。
- Audit persistence failure は routing result と分離され、apply/propose/reject/no_apply decision を書き換えてはならない。


## 許可されるトポロジー

Web client -> Worker API -> Agents -> completed StructureJob response -> runtime operation routing adapter -> Operation Router -> audit persistence port -> Turso / AI SDK.

## 移行用の seam

一時的な mock providers は test/dev のみで許可される。

## 削除対象

AI runtime adapter の外に散在する provider-specific calls を削除する。

## ガード / 検証

Runtime PRs は contract dependencies を明示し、Operation Router を迂回する direct apply path、non-completed StructureJob からの routing、generated projection 依存がないことを検証しなければならない。
