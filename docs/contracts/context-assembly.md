# コンテキスト組み立て契約

ドキュメント種別: contract  
権威: AI が見る内容の信頼できる唯一の情報源  
オーナー: context assembly オーナー  
付随契約: ai-structuring-lifecycle.md, app-note-model.md, memory.md  
生成済み companion: contexts/context-assembly/src/contract/contextEnvelopeContract.ts  
検証レーン: context budget + truncation tests  
ステータス: active

## 目的

note title/description を first-class context として使用しながら、context を境界づけられた関連性の高いものに保つ。

## この契約が所有するもの


- コンテキストエンベロープ のフィールド。
- Title/description の使用。
- Retrieval order。
- コンテキスト予算。
- full workspace dumps を避けるルール。


## この契約が所有しないもの


- AI provider choice。
- Operation schema validation。
- UI digest rendering。


## 不変条件


MVP のコンテキストエンベロープ は次を含む。
- Target Scope: target section/chunk text と source block ids。
- Note Card: note title、description_effective、heading outline。
- Local Structure: existing semantic_units、section summaries、previous structure snapshot。
- Related Context: related semantic_units top K、related notes title / description、necessary source block excerpt。
- Memory Context: active memory top K、unresolved questions、past decisions、interest themes。
- Constraints: user text を rewrite しない、operations only、source spans required、confidence required。

すべての notes、すべての memory、または full workspace content を渡してはならない。Related notes は title、description、semantic units、および必要な source excerpts のみで表現される。
- `description_effective` の優先順位は description_user、user-approved description_ai、latest description_ai、title + outline から生成した temporary note card である。
- related context retrieval の優先順位は explicit links、same note semantic units、note title / description similarity、semantic unit similarity、memory match、recency / project affinity、user feedback である。
- 目安の context budget は target section 45%、note card 10%、local semantic units 15%、related semantic units 20%、active memory 10% とする。


## 許可されるトポロジー

Structure job -> apps/worker context assembly runtime flow -> Context Assembly contract -> valid ContextEnvelope -> AI engine. Retrieval ports は canonical note/section/block snapshots、semantic unit projections、context-eligible memory projections を使用する。Retrieval ports は candidate input を返し、K limits、budget、retrieval order、trust boundary は Context Assembly contract が所有する。

## 移行用の seam

description が存在しない場合、一時的な fallback description を title + outline から生成してよい。

## 削除対象

任意の full-note history を連結する prompt builders を削除する。

## ガード / 検証

テストは K limits、token/context budgets、description_effective priority、untrusted content boundary を強制しなければならない。
