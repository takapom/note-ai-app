# AI Native Note App 要件定義書

Version: 0.1 draft  
Status: MVP target requirements  
Audience: Product owner, Codex agents, Superset task agents, frontend/backend implementers  
Primary principle: Contract first, implementation converges to target model

---

## 0. この要件定義の目的

本書は、ここまでの議論で決定した内容を、アプリ開発に必要な要件として整理したものです。

このアプリは、単なる Notion clone、Apple Notes clone、AI chat app、PKM graph tool ではありません。

中心思想は以下です。

> ユーザーは自然に書く。  
> AI は裏側で覚え、つなげ、整理する。  
> ただし、AI は書く体験を邪魔せず、ユーザー本文を勝手に書き換えない。  
> AI の整理結果は、別ペインではなく同じノート内に編集可能な構造として返る。

この要件定義では、以下を固定します。

- プロダクト思想
- MVP 範囲
- 非 MVP 範囲
- UI/UX 要件
- ノート構造要件
- AI 構造化ライフサイクル
- Context Assembly 要件
- Operation-based AI 要件
- Memory / Provenance 要件
- Backend runtime 要件
- Codex / Superset 開発運用要件
- 非機能要件
- SoT / authority graph / contract-first governance

---

## 1. プロダクト概要

### 1.1 プロダクト定義

本アプリは、気持ちよく書けるノート体験を入口にしながら、AI が裏側でユーザーの思考を記憶・接続・構造化し、必要なタイミングで同じノート内に整理候補として返す AI ネイティブノートアプリである。

### 1.2 コアコンセプト

```txt
書くためのノートではなく、
自分の考えが失われず、後から返ってくるノート。
```

または、

```txt
書き心地はノート。中身は外部脳。
```

### 1.3 解決したい違和感

従来のノートやメモは、ユーザーに以下の責務を要求しすぎる。

```txt
書く
見返す
覚えておく
タグ付けする
リンクする
構造を整理する
過去の文脈とつなげる
次のアクションを決める
```

このアプリでは、これらのうち「覚える」「探す」「つなげる」「構造化する」「再提示する」の責務を AI とアプリ側に移譲し、ユーザーは本来人間が担うべき責務に集中できるようにする。

---

## 2. 第一原理

### 2.1 Owner が SoT を持つ

SoT は UI route、DB table proximity、consumer 数、便利な shared package によって決まらない。

SoT を持つ owner は、以下を持つ場所で決まる。

```txt
language
lifecycle
invariant
consistency boundary
change reason
```

### 2.2 Topology は制約として固定する

各レイヤーが、

```txt
何を担うか
何を担わないか
どのレイヤーと接続してよいか
どのレイヤーに依存してはいけないか
```

を明確にする。

迷った場合は、以下を優先する。

```txt
1. クリーンな責務
2. 保守性
3. 一貫した境界
4. ただし他レイヤーとの差異は必要最小限
```

### 2.3 SoT と Projection を分ける

同じ情報が複数の surface に現れても、それらは同じ種類の truth ではない。

例:

```txt
policy / architecture decision:
  docs/contracts/**

live product semantics:
  contexts/*/src/contract/*

owner-local UI/product policy:
  apps/*/docs/*contract.md

generated evidence/register:
  docs/generated/**

task traceability:
  GitHub issue / PR / Superset workspace

API generated contract:
  apps/workspace-api/generated/openapi.json
```

SoT は単一フォルダではなく、authority graph として設計する。

---

## 3. Documentation / Contract System 要件

### 3.1 docs の文書種別

Docs は wiki 的に増やさず、文書種別で責務を切る。

```txt
contract:
  decision / ownership / invariant の SoT

guide:
  contributor procedure

runbook:
  operator recovery procedure

record:
  history / ADR

generated:
  machine-owned evidence

portal:
  routing only

alias:
  temporary compatibility path
```

### 3.2 Documentation flow

```txt
docs/README.md:
  入口、routing

docs/generated/**:
  網羅索引、machine-owned register

docs/contracts/**:
  判断の SoT

guides:
  手順のみ。policy を再定義しない

runbooks:
  復旧手順のみ。architecture を再定義しない
```

### 3.3 Contract structure

各 contract は可能な限り以下を含む。

```txt
- 何を所有するか
- 何を所有しないか
- companion contract はどれか
- generated companion は何か
- guard / verification lane は何か
- transitional seam はどこまで許すか
- target から見て削除すべきものは何か
```

### 3.4 Target model first

この repo は、既存実装に合わせて docs を書くのではなく、target model を contract として先に固定し、実装をそこへ収束させる。

互換維持、bridge、fallback、dual-read/write は default ではない。

原則は以下。

```txt
canonical gap を減らす direct replacement を優先する。
transitional seam は contract に明示された場合のみ許可する。
```

---

## 4. ターゲットユーザー

### 4.1 Vision target

最終的には、広く誰でも使える「思考の外部脳」レイヤーを狙う。

### 4.2 Initial target

MVP では、業界ではなく認知作業のタイプで絞る。

```txt
知的作業をする個人
```

具体例:

```txt
個人開発者
学生
研究者
ライター
プロダクト企画者
クリエイター
```

### 4.3 初期ユーザーの課題

```txt
アイデアはあるが散らばる
ノートは書くが見返さない
過去の判断理由を忘れる
未解決の問いが埋もれる
自分の考えを説明しづらい
AIを使いたいが自分の思考まで失いたくない
```

---

## 5. 競合との差別化要件

### 5.1 Notion との差別化

Notion は、ユーザーがページ・DB・プロパティ・リレーションを設計する。

本アプリは、ユーザーに構造設計を強要しない。

```txt
Notion:
  ユーザーが構造を作る

本アプリ:
  ユーザーは書く
  AI が構造を裏側で作る
  必要な整理だけ同じノート内に返す
```

### 5.2 Apple Notes との差別化

Apple Notes は速く書けるが、整理・記憶・関連づけは人間側に残る。

本アプリは、Apple Notes 的な軽さを保ちながら、AI が後から思考を整理する。

### 5.3 Obsidian + Claude / Codex との差別化

Obsidian + Claude/Codex は、基本的に外部 AI を後付けで vault に当てる構成である。

```txt
Obsidian + AI:
  Markdown vault を人間が作る
  外部AIに読ませる
  整理させる
  結果を人間が反映する

本アプリ:
  ノート構造・AI operation・source span・memory が最初から統合されている
  AI は operation を返し、Operation Router が安全に適用する
  AI の整理結果は同じノート surface 内で編集可能になる
```

差別化の要点:

```txt
- 後付け AI ではなく、AI 構造化前提の document model
- Markdown file ではなく thought event / Block / Section model
- AI 自由編集ではなく operation-based editing
- Memory が編集可能
- Provenance が保持される
```

### 5.4 Mem / mymind との差別化

Mem / mymind は「AI が覚える」方向が強い。

本アプリは、AI が覚えるだけでなく、覚える候補を同じノート内に返し、ユーザーが編集・承認できる。

---

## 6. 人間・AI・アプリの責務分担

### 6.1 人間が担う責務

```txt
自然に書く
違和感を持つ
何を大切にするか判断する
AI の整理を自分の言葉に直す
最終的な意思決定を引き受ける
承認する
削除する
```

### 6.2 AI が担う責務

```txt
覚える候補を作る
探す
つなげる
構造化する
過去の文脈を連れてくる
未整理の問いを提示する
関連するノートや意味単位を見つける
```

### 6.3 アプリが担う責務

```txt
書き心地を守る
AI の発火タイミングを制御する
AI の操作を安全に適用する
由来と取り消し可能性を保持する
AI とユーザー本文の boundary を守る
```

---

## 7. MVP スコープ

### 7.1 MVP に含める

```txt
Unified Note Surface
App-specific Block / Section document model
Note title
Note description
H1/H2/H3 heading support
AI Assist Block
Next Open Digest
Note close / tab switch / app leave 後の構造化
Dirty section tracking
AI operation schema
Operation Router
Source spans / provenance
Memory candidate
Context Assembly
Cloudflare Agents SDK based backend runtime
Worker + AI SDK
Turso canonical DB
Codex / Superset 開発運用 contract
```

### 7.2 MVP に含めない

```txt
AI mode switcher
persistent AI chat panel
Graph view 主役 UI
外部連携
team sharing
Notion database clone
kanban/calendar/table database view
複雑な property system
毎 keystroke AI structuring
Markdown を内部 SoT にすること
AI による user block direct rewrite
```

### 7.3 将来候補

```txt
Google Docs export
Google Calendar action candidate
Slack action candidate
Graph / cluster view
Memory dashboard
Team workspace
External content ingestion
```

ただし、外部連携は第一思想ではなく、整理された思考を外へ運ぶための extension とする。

---

## 8. UI / UX 要件

### 8.1 基本方針

```txt
ユーザーが触るのは一枚のノート。
AI は別ペインのチャットではなく、同じノート内に静かに入る。
```

### 8.2 UI 原則

#### UX-001: Single Surface

ユーザーはノート本文と AI 解釈ペインを行き来しない。

AI の整理結果は、ノート内の AI Assist Block として表示する。

#### UX-002: Quiet AI

AI は書いている最中に割り込まない。

```txt
入力中:
  AI表示なし

note close / tab switch 後:
  background structuring

next open:
  必要な整理候補を控えめに表示

manual organize:
  その場で AI Assist Block を挿入可能
```

#### UX-003: Editable Intelligence

AI の出力は編集可能であること。

ユーザーは以下をできる。

```txt
編集
採用
削除
覚える
違うと伝える
なぜ出たか確認する
```

#### UX-004: No persistent AI chat panel

MVP では常設 AI chat panel を持たない。

### 8.3 画面構成

MVP の画面構成は以下。

```txt
AppShell
  Sidebar
  TopBar
  NoteSurface
```

#### Sidebar

MVP では最小構成。

```txt
Notes
Recent
Search
```

以下は MVP 外。

```txt
Unresolved Questions
Decisions
Memory Dashboard
Graph View
```

#### TopBar

```txt
workspace name
search
command palette
saved / sync status
```

AI 状態は控えめに出す。

```txt
Saved
Structuring...
Updated
```

#### NoteSurface

```txt
Note Header
  title
  description

Block Editor
  user blocks
  heading blocks
  AI assist blocks
  memory candidate blocks
```

### 8.4 Note Header 要件

ノートは title と description を持つ。

```txt
title:
  ユーザーが編集する主要タイトル

description_user:
  ユーザーが明示的に書いた説明

description_ai:
  AI が note close 後などに生成した説明候補

description_effective:
  Context Assembly で使う説明
```

UI 表示:

```txt
ユーザー入力 description:
  通常表示

AI生成 description:
  薄い表示
  AI suggested ラベル
  編集可能

ユーザーが編集したら:
  user description として扱う
```

### 8.5 AI Assist Block 要件

AI の整理結果は、同じノート内の block として表示する。

MVP の AI block type:

```txt
ai_summary
ai_question
ai_decision
ai_related_context
ai_memory_candidate
```

#### AI Assist Block UI

```txt
薄い背景
控えめなAIラベル
折りたたみ可能
編集可能
削除可能
source確認可能
```

操作:

```txt
[編集]
[採用]
[削除]
[なぜ？]
```

Memory candidate では:

```txt
[覚える]
[編集]
[違う]
[削除]
```

### 8.6 Next Open Digest 要件

Note close / tab switch 後に構造化した結果は、次にノートを開いたときに控えめに提示する。

UI:

```txt
前回の編集から整理候補があります  [表示] [閉じる]
```

展開時:

```txt
未解決の問い
決定事項
関連する過去ノート
このノートから覚える候補
```

### 8.7 Manual Organize 要件

MVP でも単発の手動整理操作は提供する。

```txt
Command Palette:
  このセクションを整理
  このノートを整理
  未解決の問いを抽出
  決定事項を抽出
  関連ノートを探す
  この内容を覚える
```

Slash command も将来候補。

```txt
/整理
/問い
/決定
/関連
/覚える
```

MVP では最小実装でよい。

---

## 9. ノート構造要件

### 9.1 内部正本

内部正本は Markdown ではない。

内部正本は app-specific Block / Section model とする。

```txt
Note
  Section
    Block
      InlineSpan / Annotation
```

### 9.2 Markdown の位置づけ

```txt
Markdown:
  import/export format
  internal source of truth ではない
```

### 9.3 Heading の意味

H1/H2/H3 は単なる見た目ではなく section boundary である。

```txt
H1:
  大テーマ

H2:
  section boundary の中心

H3:
  subsection
```

ただし、ユーザーには自然な見出しとして見せる。

### 9.4 Style と Structure の分離

```txt
Heading:
  構造。AI structuring scope になる。

Large text / bold:
  style。AI structuring boundary にはしない。
```

### 9.5 Section がない場合

見出しがないノートでは、内部的に implicit section / stable chunk を作る。

ユーザーに見せる必要はない。

```txt
sectionがある:
  heading配下をscopeにする

sectionがない:
  stable chunk をscopeにする
```

### 9.6 Block Type

MVP の user block type:

```txt
paragraph
heading
bullet_list_item
numbered_list_item
todo
quote
code
divider
```

MVP の AI block type:

```txt
ai_summary
ai_question
ai_decision
ai_related_context
ai_memory_candidate
```

---

## 10. AI 構造化ライフサイクル要件

### 10.1 基本方針

MVP では AI 構造化モードを UI に出さない。

内部では常に silent structuring lifecycle を持つが、ユーザー入力中には AI が割り込まない。

### 10.2 主トリガー

MVP の主トリガー:

```txt
note close
tab switch
app leave
```

補助トリガー:

```txt
next open
manual organize
```

### 10.3 Keystroke AI 禁止

ユーザー入力ごとに LLM を呼んではならない。

```txt
BlockChanged:
  save blocks
  record edit event
  mark dirty scope
  maybe update lightweight index
  do not call LLM
```

### 10.4 Note close flow

```txt
User leaves note
  -> save latest blocks
  -> mark note session ended
  -> find dirty sections
  -> enqueue structure job for dirty sections
  -> background AI structuring
  -> operations saved/applied
  -> next open digest prepared
```

### 10.5 Next open recovery

Browser/tab close event は取りこぼしがあるため、next open で dirty sections を確認し、未処理 structure job を回収する。

### 10.6 Structuring scope

基本は section 単位。

```txt
Block:
  小さすぎる。context不足。

Section:
  MVP の基本構造化対象。

Note:
  note description / summary 生成時のみ。

Workspace:
  retrieval 対象。直接構造化対象ではない。
```

### 10.7 Dirty section tracking

各 section は以下を持つ。

```txt
content_hash
last_structured_hash
last_structured_at
is_dirty
```

構造化は、`content_hash != last_structured_hash` の section のみ対象。

### 10.8 Context hash dedupe

AI job は context_hash を持ち、同じ context_hash の成功済み job は再実行しない。

---

## 11. Context Assembly 要件

### 11.1 Context Assembly の目的

AI にすべてのノートを渡さず、必要な文脈だけを Context Envelope として組み立てる。

### 11.2 Context Envelope

MVP の Context Envelope:

```txt
1. Target Scope
   - target section/chunk text
   - source block ids

2. Note Card
   - note title
   - description_effective
   - heading outline

3. Local Structure
   - existing semantic_units in this note/section
   - section summaries
   - previous structure snapshot

4. Related Context
   - related semantic_units top K
   - related notes title / description
   - necessary source block excerpt

5. Memory Context
   - active memory top K
   - unresolved questions
   - past decisions
   - interest themes

6. Constraints
   - do not rewrite user text
   - return operations only
   - require source spans
   - require confidence
```

### 11.3 Note title / description の利用

各ノートの title と description_effective は、Context Assembly の重要な入力である。

description_effective の優先順位:

```txt
1. description_user
2. user-approved description_ai
3. latest description_ai
4. temporary note card generated from title + outline
```

### 11.4 Related context retrieval

関連検索の優先順位:

```txt
1. explicit links
2. same note semantic units
3. note title / description similarity
4. semantic unit similarity
5. memory match
6. recency / project affinity
7. user feedback
```

### 11.5 Context budget

AI に渡す context は budget を持つ。

目安:

```txt
target section:
  45%

note card:
  10%

local semantic units:
  15%

related semantic units:
  20%

active memory:
  10%
```

---

## 12. AI Operation 要件

### 12.1 基本方針

AI は構造化結果を自由文章で返さない。

AI は operation list を返す。

### 12.2 許可 operation

MVP で許可する operation:

```txt
create_semantic_unit
create_relation
create_memory_candidate
insert_assist_block
mark_stale
no_op
```

### 12.3 禁止 operation

MVP では禁止:

```txt
rewrite_user_block
send_external_message
create_external_event
delete_user_block
modify_user_block_without_review
```

### 12.4 Source span 必須

AI visible operation は source spans を持つ必要がある。

```txt
sourceSpans:
  blockId
  startOffset optional
  endOffset optional
```

### 12.5 Confidence 必須

AI operation は confidence を持つ。

confidence が低い operation は適用しない、または no_op にする。

### 12.6 Operation Router

AI operation は直接 DB / UI に適用しない。

Operation Router の責務:

```txt
schema validation
source span validation
confidence threshold check
target existence check
policy decision
ai_operations record
safe apply
unsafe operation rejection
```

### 12.7 Operation policy

内部 policy:

```txt
silent:
  semantic_units / edges など裏側のみ

inline:
  AI Assist Block として同じノート内に挿入

review:
  memory candidate / rewrite / external action など承認待ち

blocked:
  危険または不正
```

MVP では policy UI は出さなくてよい。

---

## 13. Memory 要件

### 13.1 Memory の目的

ユーザーが覚え続ける必要がある文脈を、AI が候補として保持し、ユーザーが承認・編集できるようにする。

### 13.2 MVP Memory type

MVP では以下に絞る。

```txt
unresolved_question
past_decision
interest_theme
```

### 13.3 Memory state

```txt
candidate:
  AI が覚える候補として作成

pending:
  ユーザー確認待ち

active:
  ユーザー承認済み、または信頼可能

pinned:
  ユーザーが明示的に重要化

rejected:
  ユーザーが否定

archived:
  現在重要ではない
```

### 13.4 Memory UX

Memory candidate は、別 dashboard だけではなく、ノート内の AI Memory Candidate Block として提示する。

ユーザー操作:

```txt
覚える
編集
違う
削除
保留
```

### 13.5 Memory source

Memory は必ず source_unit_id / source_note_id / source_span を持つ。

Memory が削除された場合、以後の context assembly に利用してはならない。

---

## 14. Provenance / Explainability 要件

### 14.1 基本方針

AI 生成物は、なぜ出たのか説明可能でなければならない。

### 14.2 Source-backed suggestions

AI Assist Block には `なぜ？` 操作を持たせる。

表示する情報:

```txt
source blocks
source text excerpt
operation type
classification
related memory
confidence
```

### 14.3 Source span table

AI-generated target は source_spans を持つ。

```txt
target_type
target_id
source_block_id
start_offset
end_offset
reason
```

### 14.4 Activity log の位置づけ

MVP では常設 Activity Log 画面は持たない。

各 AI block の `なぜ？` から説明する。

---

## 15. Backend Runtime 要件

### 15.1 採用方針

```txt
Cloudflare Worker:
  HTTP API / auth / routing / AI SDK provider registry

Cloudflare Agents SDK:
  NoteAgent / WorkspaceBrainAgent / ActionAgent future

Turso:
  canonical DB

Agent local SQL:
  transient state / queue / dirty tracking / retry

AI SDK:
  provider abstraction / structured output
```

### 15.2 Agent 分割

MVP:

```txt
NoteAgent:
  edit event buffer
  dirty section tracking
  note leave handling
  structure job scheduling
  context_hash dedupe

WorkspaceBrainAgent:
  related context retrieval
  memory candidate management
  workspace-wide semantic graph
```

将来:

```txt
ActionAgent:
  external action candidate
  approval
  retry / outbox
```

### 15.3 Turso と Agent local SQL の境界

```txt
Turso:
  canonical DB
  notes
  blocks
  sections
  semantic_units
  semantic_edges
  memory_items
  ai_operations
  source_spans

Agent local SQL:
  transient state
  current session
  dirty tracking
  pending jobs
  retry queue
```

Agent local SQL と Turso は自動 Sync しない。

Turso serverless を使う。

### 15.4 AI SDK / Vendor lock 回避

アプリ内部で provider-specific call を散らさない。

```txt
createModelRegistry
structureModel abstraction
mock provider for tests
```

Provider switch は registry / env config で行う。

---

## 16. Data Model 要件

### 16.1 notes

```txt
notes
  id
  workspace_id
  title
  description_user
  description_ai
  description_effective
  created_at
  updated_at
```

### 16.2 sections

```txt
sections
  id
  note_id
  parent_section_id
  heading_block_id
  heading_level
  title
  description_ai
  content_hash
  last_structured_hash
  last_structured_at
  position
  created_at
  updated_at
```

### 16.3 blocks

```txt
blocks
  id
  note_id
  section_id
  parent_block_id
  type
  content_json
  plain_text
  position
  origin
  content_hash
  created_at
  updated_at
```

origin:

```txt
user
ai
user_modified_ai
system
```

### 16.4 edit_events

```txt
edit_events
  id
  note_id
  block_id
  section_id
  event_type
  delta_json
  content_hash_after
  created_at
```

### 16.5 structure_jobs

```txt
structure_jobs
  id
  workspace_id
  note_id
  section_id
  target_scope
  trigger_reason
  context_hash
  status
  priority
  created_at
  started_at
  completed_at
```

trigger_reason:

```txt
note_closed
tab_switched
app_left
next_open
manual_organize
```

### 16.6 semantic_units

```txt
semantic_units
  id
  workspace_id
  note_id
  section_id
  source_block_id
  type
  content
  summary
  confidence
  status
  created_at
  updated_at
```

type:

```txt
question
decision
claim
hypothesis
concern
concept
task
evidence
```

### 16.7 semantic_edges

```txt
semantic_edges
  id
  workspace_id
  from_unit_id
  to_unit_id
  relation_type
  reason
  confidence
  status
  created_at
```

relation_type:

```txt
supports
contradicts
depends_on
answers
raises
extends
reframes
duplicates
```

### 16.8 memory_items

```txt
memory_items
  id
  workspace_id
  user_id
  type
  content
  source_unit_id
  source_note_id
  confidence
  status
  pinned
  created_at
  updated_at
```

### 16.9 ai_operations

```txt
ai_operations
  id
  workspace_id
  note_id
  section_id
  structure_job_id
  operation_type
  policy
  status
  payload_json
  source_block_ids_json
  created_at
  applied_at
```

### 16.10 source_spans

```txt
source_spans
  id
  target_type
  target_id
  source_block_id
  start_offset
  end_offset
  reason
  created_at
```

---

## 17. API / Event 要件

### 17.1 UI events

```txt
BlockChanged
NoteClosed
TabSwitched
AppLeft
NextOpen
ManualOrganizeRequested
AssistBlockAccepted
AssistBlockDismissed
MemoryCandidateAccepted
MemoryCandidateRejected
```

### 17.2 Backend events

```txt
DirtySectionMarked
StructureJobEnqueued
ContextEnvelopeBuilt
OperationsGenerated
OperationValidated
OperationApplied
OperationRejected
DigestPrepared
```

### 17.3 API MVP

```txt
GET /notes
POST /notes
GET /notes/:noteId
PATCH /notes/:noteId

POST /notes/:noteId/blocks
PATCH /blocks/:blockId
DELETE /blocks/:blockId

POST /notes/:noteId/leave
POST /notes/:noteId/structure/manual
GET /notes/:noteId/digest

POST /ai-operations/:operationId/accept
POST /ai-operations/:operationId/dismiss
POST /memory/:memoryId/accept
POST /memory/:memoryId/reject
```

実際の route 名は実装時に contract 化する。

---

## 18. 非機能要件

### 18.1 書き心地

NFR-UX-001: ユーザーの入力操作は AI 処理によってブロックされてはならない。  
NFR-UX-002: block edit は即時反映されること。  
NFR-UX-003: AI Assist Block 挿入はユーザーのカーソル位置を奪ってはならない。  
NFR-UX-004: 入力中に layout shift を発生させないこと。

### 18.2 AI safety

NFR-AI-001: AI は user-authored block を承認なしに直接 rewrite してはならない。  
NFR-AI-002: AI は operations のみ返す。  
NFR-AI-003: AI operation は schema validation を通過しなければ適用されない。  
NFR-AI-004: external action は MVP では実行しない。将来も承認制。

### 18.3 Provenance

NFR-PROV-001: AI-generated block は source span を持つ。  
NFR-PROV-002: Memory は source を持つ。  
NFR-PROV-003: `なぜ？` で source を確認できる。

### 18.4 Consistency

NFR-CONS-001: User block を正本とする。  
NFR-CONS-002: AI structure は projection / derived data。  
NFR-CONS-003: AI structure は eventual consistency でよい。  
NFR-CONS-004: stale structure は stale として扱う。

### 18.5 Undo / Revert

NFR-UNDO-001: AI Assist Block は削除可能。  
NFR-UNDO-002: AI operation は revert 可能に設計する。  
NFR-UNDO-003: User undo と AI operation revert は区別する。

### 18.6 Security / Privacy

NFR-SEC-001: workspace/user isolation を守る。  
NFR-SEC-002: AI に送る context は必要最小限。  
NFR-SEC-003: 外部由来 content は untrusted として扱う。  
NFR-SEC-004: note 削除時、derived structure / memory candidates を削除または無効化する。

### 18.7 Prompt injection

NFR-AISAFE-001: note text / external text / memory は untrusted content として扱う。  
NFR-AISAFE-002: untrusted content を system instruction として扱わない。  
NFR-AISAFE-003: Operation Router が unsafe operation を reject する。

### 18.8 Performance / Cost

NFR-PERF-001: LLM を keystroke ごとに呼ばない。  
NFR-PERF-002: structure job は section scope を基本とする。  
NFR-PERF-003: context_hash dedupe を行う。  
NFR-PERF-004: related context は top K に制限する。  
NFR-COST-001: AI cost を user/workspace/job 単位で観測可能にする。

### 18.9 Reliability

NFR-REL-001: AI provider が失敗してもノート編集は継続できる。  
NFR-REL-002: structure job 失敗は retry / failed status として扱う。  
NFR-REL-003: note leave event が取りこぼされた場合、next open で回収する。

### 18.10 Observability

NFR-OBS-001: structure job count / failure rate / cost を追跡する。  
NFR-OBS-002: AI Assist Block の accepted / dismissed / edited rate を追跡する。  
NFR-OBS-003: Memory candidate の accepted / rejected rate を追跡する。

---

## 19. Verification / Guard 要件

### 19.1 Verification lanes

```txt
contract verification:
  docs/contracts と contexts/*/contract の整合

type verification:
  TypeScript typecheck

schema verification:
  Zod / JSON schema validation

operation verification:
  unsafe operation reject test

UI verification:
  AI chat panel が追加されていないこと
  AI mode switcher が追加されていないこと

runtime verification:
  note close -> structure job enqueue
  next open -> digest
```

### 19.2 Codex review checklist

Codex PR review では以下を確認する。

```txt
AI chat UI を勝手に追加していないか
AI mode switcher を追加していないか
keystroke ごとに LLM を呼んでいないか
Markdown を内部 SoT にしていないか
user block を AI が直接 rewrite できる設計になっていないか
source spans なしの operation を許していないか
note close / tab switch 方針に反していないか
external integration を MVP に入れていないか
```

---

## 20. Codex / Superset 開発運用要件

### 20.1 Codex 運用方針

Codex には一気にアプリ全体を作らせない。

```txt
1 task = 1 owner contract = 1 Superset workspace = 1 PR相当
```

### 20.2 Codex task prompt format

各 task は以下を含む。

```txt
Goal
Context
Constraints
Implementation notes
Done when
Validation
```

### 20.3 Plan-first

以下の task は plan-first とする。

```txt
data model change
Operation Router
Context Assembly
AI provider abstraction
Editor architecture
Turso migration
Cloudflare Agents design
```

### 20.4 Superset MCP 運用

Superset workspace は traceability surface であり、SoT ではない。

Superset task は、必ず contract に紐づける。

### 20.5 Subagent briefs

想定 subagent:

```txt
product-contract-keeper
topology-guardian
frontend-surface-agent
document-model-agent
ai-operations-agent
scheduler-agent
context-memory-agent
runtime-infra-agent
verification-agent
superset-coordinator
```

### 20.6 Skills

想定 Codex skills:

```txt
contract-authoring
topology-review
superset-task-delegation
operation-contract-implementation
frontend-note-surface
structure-scheduler
context-assembly
codex-pr-review
drift-detection
docs-register-generation
```

---

## 21. 初期実装順序

推奨順:

```txt
00 bootstrap repo docs
01 domain contracts
02 operation schema
03 operation router
04 unified note surface UI
05 note leave scheduler
06 context assembly
07 runtime provider registry
08 next open digest
09 provenance popover
10 generated register check
```

この順序は、UI が先に暴走して思想が崩れるのを防ぐ。

---

## 22. Acceptance Criteria

MVP が成立したと言える条件:

```txt
1. ユーザーは一枚のノートに書ける
2. H1/H2/H3 が section boundary として扱われる
3. blocks / sections が内部正本として保存される
4. note close / tab switch / app leave で dirty section の structure job が作られる
5. keystroke ごとに AI が呼ばれない
6. Context Assembly が title / description / target section / related units / memory を使う
7. AI は operation schema に従って返す
8. Operation Router が unsafe operation を reject する
9. AI Assist Block が同じノート内に表示される
10. Next Open Digest が表示できる
11. Memory candidate をノート内で承認/拒否できる
12. Provenance Popover で source を確認できる
13. AI provider 失敗時でもノート編集が継続できる
14. MVP に AI chat panel / AI mode switcher / external integration が入っていない
15. Codex task / Superset workspace / docs contract の traceability が維持される
```

---

## 23. Open Questions

現時点で未決の論点:

```txt
1. Note description はユーザー入力をどの程度促すか
2. Next Open Digest は自動展開か、折りたたみか
3. AI Assist Block の表示頻度の最適値
4. Memory candidate の自動 active 化を許すか
5. Section stable を note close 以外でも使うか
6. Embedding store をどこに置くか
7. Turso schema migration の管理方法
8. Mobile MVP を同時に考えるか
9. Superset task と GitHub issue の traceability をどう同期するか
```

---

## 24. 非目標 / Anti-goals

このアプリは以下ではない。

```txt
Notion clone
Apple Notes clone
Obsidian graph clone
AI chat app
Zapier/Make-like workflow automation tool
AI meeting minutes app
Full PKM graph editor
Database-first workspace
```

---

## 25. 一文まとめ

このアプリは、ユーザーが自然に書いたノートを、AI がノートを離れた後に静かに構造化し、次に開いたとき同じノート内に編集可能な整理として返す AI ネイティブノートである。

ユーザー本文は正本、AI 構造は projection。  
AI は free-form な回答ではなく operation を返す。  
Operation Router がそれを安全に適用する。  
SoT は authority graph として設計され、Codex / Superset は contract に従って実装を収束させる。
