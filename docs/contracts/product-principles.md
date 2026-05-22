# プロダクト原則契約

ドキュメント種別: contract  
権威: プロダクト思想、責務分担、差別化方針の信頼できる唯一の情報源  
オーナー: product オーナー  
付随契約: mvp-scope.md, mvp-acceptance.md, frontend-ui.md, app-note-model.md, ai-structuring-lifecycle.md  
生成済み companion: docs/generated/register.md  
検証レーン: product review lane  
ステータス: active

## 目的

アプリが Notion clone、Apple Notes clone、Obsidian graph clone、または AI chat app に逸脱することを防ぎ、「自然に書いた思考が失われず、後から整理されて返ってくるノート」という product thesis を固定する。

## この契約が所有するもの


- Human/AI の責務分担。
- ターゲットユーザーと解決する認知課題。
- 競合との差別化軸。
- MVP の非目標。
- 統一ノートサーフェス 原則。
- Quiet AI 原則。
- Editable Intelligence 原則。


## この契約が所有しないもの


- 正確な component styles。
- runtime implementation details。
- database migration syntax。


## 不変条件


- Vision target は広く使える「思考の外部脳」だが、MVP の initial target は知的作業をする個人である。
- 初期ユーザーの課題は、アイデアが散らばる、ノートを見返さない、判断理由を忘れる、未解決の問いが埋もれる、自分の考えを説明しづらい、AI を使いたいが自分の思考まで失いたくない、である。
- Human responsibilities: 自然に書く、違和感を持つ、何を大切にするか判断する、AI の整理を自分の言葉に直す、最終意思決定を引き受ける、編集する、削除する。
- AI responsibilities: 覚える候補を作る、探す、つなげる、構造化する、過去の文脈を連れてくる、未整理の問いを提示する、関連するノートや意味単位を見つける。
- App responsibilities: 書き心地を守る、AI の発火タイミングを制御する、AI の操作を安全に適用する、由来と取り消し可能性を保持する、AI とユーザー本文の boundary を守る。
- Writing surface は Notion-like な直接編集体験を持ってよいが、Notion clone にはしない。database/property/relation 設計ではなく、自然に書ける block editor と AI による非同期整理が差別化軸である。
- Markdown-compatible authoring は入力体験であり、内部 SoT は app-specific Note / Section / Block model である。
- MVP には AI モード切り替えがない。
- MVP には persistent AI chat panel がない。
- MVP external integrations は延期される。
- アプリは human judgment を奪わずに、remembering と manual structuring の負担を取り除く。
- Notion との差別化は、ユーザーに database/property/relation 設計を強要せず、AI が裏側で構造を作る点にある。
- Apple Notes との差別化は、軽い書き心地を保ちながら、後から AI が思考を整理する点にある。
- Obsidian + 外部 AI との差別化は、AI 構造化前提の document model、operation-based editing、source span、memory、provenance が最初から統合されている点にある。
- Mem / mymind との差別化は、AI が覚えるだけでなく、覚える候補を同じノート内に返し、ユーザーが編集・保留・削除でき、sensitive/profile-like memory は明示的に扱える点にある。


## 許可されるトポロジー

Product principles は MVP scope、acceptance、frontend、lifecycle、operation、memory、NFR contracts を認可する。

## 移行用の seam

将来の AI chat または external integrations には新しい contracts が必要であり、暗黙の MVP additions にはできない。

## 削除対象

core note surface より前に AI chat、graph view、external integration、database-first workspace、workflow automation を中心に据える UI/feature proposals を削除する。

## ガード / 検証

すべての feature task は、writing flow と human ownership をどのように保持するかを述べなければならない。
