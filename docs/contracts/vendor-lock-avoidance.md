# ベンダーロック回避契約

ドキュメント種別: contract  
権威: provider abstraction の信頼できる唯一の情報源  
オーナー: runtime infrastructure オーナー  
付随契約: backend-runtime.md, operation-return-contract.md  
生成済み companion: apps/worker/docs/runtime-contract.md  
検証レーン: provider abstraction tests  
ステータス: active

## 目的

product logic を変更せずに AI provider switching を可能に保つ。

## この契約が所有するもの


- AI SDK プロバイダーレジストリ boundary。
- provider-specific calls は runtime adapter 内に留まるというルール。
- tests のための Mock provider strategy。


## この契約が所有しないもの


- production の Model selection policy。
- specific operations の Prompt content。


## 不変条件


- Product code は プロバイダーレジストリ / model abstraction を通じて structure model を要求する。
- Runtime は `createModelRegistry`、structure model abstraction、mock provider for tests を持つ。
- Tests は mock structured-output provider を使用する。
- Operation schema は provider-independent である。
- context contracts、UI、operation router 内に provider-specific SDK calls を置かない。
- Provider switch は registry / env config で行う。
- Operation generation provider port は ContextEnvelope と StructureJob metadata を受け取り、provider-independent operations payload を返す。Provider adapter は ContextEnvelope を full note / full workspace dump に拡張してはならない。
- Provider registry boundary は runtime adapter 内に留まり、AI Operations schema validation、Operation Router、audit persistence を所有しない。


## 許可されるトポロジー

AI Engine -> プロバイダーレジストリ -> operation generation provider. Operation schema は providers 間で stable のままである。

## 移行用の seam

registry interface の背後に分離されている場合、bootstrap 中に temporary single provider が存在してよい。

## 削除対象

app code 全体に散在する direct provider calls を削除する。

## ガード / 検証

allowed runtime adapter 外の provider imports を検索し、provider flow が Operation Router / audit persistence / provider SDK へ直接依存していないことを確認する。
