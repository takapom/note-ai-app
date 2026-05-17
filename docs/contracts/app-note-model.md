# アプリノートモデル契約

ドキュメント種別: contract  
権威: 内部ドキュメントモデルの信頼できる唯一の情報源  
オーナー: note-model コンテキストオーナー  
付随契約: unified-note-surface.md, ai-structuring-lifecycle.md, operation-return-contract.md, data-model.md  
生成済み companion: contexts/note-model/src/contract/noteContract.ts  
検証レーン: note model schema テスト  
ステータス: active

## 目的

UI、AI operations、永続化で使用する内部ノート構造を定義する。

## この契約が所有するもの


- アプリ固有の Note / Section / Block / InlineSpan / Annotation モデル。
- Note の title と description フィールド。
- Section 境界の意味論。
- Section がない場合の implicit section / stable chunk の意味論。
- MVP block type。
- Block origin の意味論。
- Markdown は import/export であり、内部 SoT ではないというルール。


## この契約が所有しないもの


- AI operation policy。
- UI スタイリング。
- 永続化マイグレーションの詳細。


## 不変条件


- Note は title、任意の user description、AI description、effective description、Sections、Blocks を持つ。
- `description_effective` の優先順位は description_user、user-approved description_ai、latest description_ai、title + outline から作る temporary note card である。
- H1/H2/H3 headings は section boundaries を作る。
- H1 は大テーマ、H2 は section boundary の中心、H3 は subsection として扱う。
- Large text / bold / visual style は structure ではない。
- heading がない note では、内部的に implicit section または stable chunk を作る。これはユーザーに見せる必要はない。
- Blocks は安定した ID を持つ。
- User blocks と AI Assist Blocks はどちらも `blocks` に存在し、origin と type で区別される。
- User-authored blocks は 信頼できる唯一の情報源である。
- AI-generated blocks は編集可能な projections である。
- MVP の user block type は `paragraph`, `heading`, `bullet_list_item`, `numbered_list_item`, `todo`, `quote`, `code`, `divider` である。
- MVP の AI block type は `ai_summary`, `ai_question`, `ai_decision`, `ai_related_context`, `ai_memory_candidate` である。


## 許可されるトポロジー

Note model は frontend、operation router、context assembly、persistence によって利用される。

## 移行用の seam

Markdown export/import は projection としてのみ許可される。

## 削除対象

内部で Markdown string を document SoT として扱う実装をすべて削除する。

## ガード / 検証

契約テストは block/section target を持たない operations を拒否しなければならない。
