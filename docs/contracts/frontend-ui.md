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
- AI Assist Block behavior。
- 次回オープンダイジェスト behavior。
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
- NoteSurface は Note Header、Block Editor、user blocks、heading blocks、AI assist blocks、memory candidate blocks を含む。
- Note Header は title、description_user、description_ai、description_effective を扱う。AI-generated description は薄く表示し、AI suggested として識別し、編集可能にする。
- ユーザーが AI-generated description を編集した場合、それは user description として扱う。
- AI Assist Blocks は note 内にレンダリングされ、薄い背景、控えめな AI ラベル、折りたたみ、編集、削除、source 確認を持つ。
- MVP の AI Assist Block actions は 編集、採用、削除、なぜ？ である。
- Memory candidate block actions は 覚える、編集、違う、削除、保留 である。
- 次回オープンダイジェスト は compact で expandable であり、未解決の問い、決定事項、関連する過去ノート、このノートから覚える候補を提示できる。
- Manual Organize は command palette から、このセクションを整理、このノートを整理、未解決の問いを抽出、決定事項を抽出、関連ノートを探す、この内容を覚える、を最小実装として提供してよい。
- AI blocks は editable、dismissible、source-inspectable である。
- Writing flow は background structuring によって中断されてはならない。


## 許可されるトポロジー

apps/web は note model + operation projections を利用し、editor events を発行する。

## 移行用の seam

Debug-only panels は non-product であることを明確に示さなければならない。

## 削除対象

MVP における permanent chat-first AI panels を削除する。

## ガード / 検証

writing-flow disruption と AI overexposure がないかレビューする。
