# フロントエンド UI 契約

ドキュメント種別: contract  
権威: MVP UI/UX patterns の信頼できる唯一の情報源  
オーナー: frontend surface オーナー  
付随契約: unified-note-surface.md, app-note-model.md, product-principles.md, non-functional-requirements.md  
生成済み companion: apps/web/docs/ui-surface-contract.md  
検証レーン: frontend review lane + 利用可能な場合は UI snapshots  
ステータス: active

## 目的

multi-panel AI UX に逸脱せず、MVP UI composition を定義する。

## この契約が所有するもの


- AppShell / Sidebar / TopBar / NoteSurface の MVP 構成。
- Note Header の title / description 表示。
- バックグラウンド整理結果の next-open digest behavior。
- 必要時にだけ表示される整理由来 projection behavior。
- Provenance popover behavior。
- Manual Organize の最小 UI entry point。


## この契約が所有しないもの


- Backend AI operation validation。
- Provider selection。
- Database schema。


## 不変条件


- Main UI は single note surface である。
- MVP の画面構成は AppShell、Sidebar、TopBar、NoteSurface である。
- Sidebar MVP は Notes、Recent、Search に限る。Unresolved Questions、Decisions、Memory Dashboard、Graph View は MVP 外である。
- TopBar は workspace name、search、command palette、saved/sync status を扱う。AI 状態は Saved、Structuring...、Updated のように控えめに表示する。
- NoteSurface は Note Header、Block Editor、user blocks、heading blocks、next-open digest、必要時の整理由来 projection blocks、memory candidate blocks を含む。
- Block Editor は Notion-like な document writing surface として見えなければならない。ユーザーが書く場所は中央の editable block list であり、AI / digest / memory の UI より視覚的に優先される。
- MVP の writing surface は Markdown-compatible authoring shortcuts を持ってよい。ただし Markdown string を内部 SoT にせず、`#`, `##`, `-`, `>`, fenced code などの入力は Note / Section / Block model へ変換される UI 入力 affordance である。
- Note Header は title、description_user、description_ai、description_effective を扱う。AI-generated description は薄く表示し、AI suggested として識別し、編集可能にする。
- ユーザーが AI-generated description を編集した場合、それは user description として扱う。
- 書いている最中、AI / agent の存在を前景化してはならない。入力直後に AI 補助 block、memory candidate、整理結果を割り込ませない。
- 整理結果は原則として note leave / tab switch / app leave 後に backend が準備し、next open 時に compact digest として返す。
- 必要な整理由来 projection が note 内に出る場合も、主語は `AI補助` ではなく `整理された文脈` / `続きの入口` / `持ち越された文脈` とし、整理由来であることは控えめに識別し、出典確認・編集・削除を可能にする。
- `採用` は整理結果を本文に出すための必須 action ではない。
- Memory candidate block actions は 覚える、編集、違う、削除、保留 である。
- 次回オープンダイジェスト は compact で expandable であり、未解決の問い、決定事項、関連する過去ノート、このノートから覚える候補を提示できる。
- Manual Organize は command palette から、このセクションを整理、このノートを整理、未解決の問いを抽出、決定事項を抽出、関連ノートを探す、この内容を覚える、を最小実装として提供してよい。
- 整理由来 projections は editable、dismissible、source-inspectable である。
- 整理由来 projections は visible note surface に存在できるが、user-authored blocks と同化してはならない。AI / agent は既存 user-authored block を直接 rewrite / delete / mutate しない。
- Writing flow は background structuring によって中断されてはならない。


## 許可されるトポロジー

apps/web は note model + operation projections を利用し、editor events を発行する。

## 移行用の seam

Debug-only panels は non-product であることを明確に示さなければならない。

## 削除対象

MVP における permanent chat-first AI panels を削除する。

## ガード / 検証

writing-flow disruption と AI overexposure がないかレビューする。
