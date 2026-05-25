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
- Capture layer と Organized layer の二層ノートモデル。
- OrganizationRun、OrganizationPreferences、RelatedContextReference の意味論。
- Note の title と description フィールド。
- Section 境界の意味論。
- Section がない場合の implicit section / stable chunk の意味論。
- MVP block type。
- Block origin の意味論。
- Markdown は import/export および authoring shortcuts の入力表現であり、内部 SoT ではないというルール。


## この契約が所有しないもの


- AI operation policy。
- UI スタイリング。
- 永続化マイグレーションの詳細。


## 不変条件


- Note は title、任意の user description、AI description、effective description、Sections、Blocks を持つ。
- MVP のノートは Capture layer と Organized layer の二層で扱う。Capture layer はユーザーが自然に書いた入力ログ、Organized layer はエージェントが構造理解して次回表示用に整えたノート版である。
- 通常表示のデフォルトは Organized layer である。Capture layer は MVP では履歴、復元、出典確認のための読み取り用ログであり、過去ログを直接編集しない。
- Capture layer は毎キー入力ではなく、ブロック保存、note leave、manual capture などの安定した確定単位で追記される。
- Organized layer は OrganizationRun によって作られる OrganizedNoteVersion として扱い、元の CaptureEntry への参照を持たなければならない。
- Organized layer は見出し化、分割、並び替え、構成整理を含んでよい。ただし復元可能性、出典確認、無断追加禁止、情報消失防止の信頼ガードを破ってはならない。
- ユーザーが Organized layer を編集した内容は通常入力として扱う。次回整理と衝突する場合はユーザー編集を優先する。
- ノート単位で自動整理反映を無効化できる。無効化は Organized layer への自動反映を止めるもので、明示的な manual organize や backend の構造理解そのものを禁止するものではない。
- Workspace-level OrganizationPreferences は自由プロンプトを持てる。ただし復元可能性、出典確認、無断追加禁止、情報消失防止はプロンプトで上書きできない固定ガードである。
- RelatedContextReference は過去メモとの関係を表示するための参照であり、MVP では過去メモの本文を Organized layer に勝手に混ぜない。
- 一般知識や AI 補足は Organized layer の本文に入れず、別枠の補助として区別する。
- `description_effective` の優先順位は description_user、user-approved description_ai、latest description_ai、title + outline から作る temporary note card である。
- H1/H2/H3 headings は section boundaries を作る。
- H1 は大テーマ、H2 は section boundary の中心、H3 は subsection として扱う。
- Large text / bold / visual style は structure ではない。
- heading がない note では、内部的に implicit section または stable chunk を作る。これはユーザーに見せる必要はない。
- Blocks は安定した ID を持つ。
- User blocks と整理由来 projection blocks はどちらも `blocks` に存在でき、origin と type で区別される。
- Capture layer の user-authored content は復元と出典の基準である。Organized layer は通常表示・編集されるノート版だが、元の CaptureEntry への履歴参照なしに生成してはならない。
- AI-generated assist / memory blocks は編集可能な projections であり、Organized layer の本文と同化してはならない。
- MVP の user block type は `paragraph`, `heading`, `bullet_list_item`, `numbered_list_item`, `todo`, `quote`, `code`, `divider` である。
- MVP の AI block type は `ai_summary`, `ai_question`, `ai_decision`, `ai_related_context`, `ai_memory_candidate` である。


## 許可されるトポロジー

Note model は frontend、operation router、context assembly、persistence によって利用される。

## 移行用の seam

Markdown export/import は projection としてのみ許可される。MVP の Markdown-compatible authoring shortcuts は、入力された Markdown-like text を app-specific block types へ変換する UI affordance であり、Markdown string を canonical note data として保存してはならない。

## 削除対象

内部で Markdown string を document SoT として扱う実装をすべて削除する。

## ガード / 検証

契約テストは block/section target を持たない operations を拒否しなければならない。
