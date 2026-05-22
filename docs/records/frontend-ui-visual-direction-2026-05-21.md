# Frontend UI visual direction

ドキュメント種別: record
作成日: 2026-05-21
目的: AI Native Note の frontend 実装における visual direction、配色、surface 構成、必要情報量を記録する。
関連実装計画: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`
関連契約: `docs/contracts/frontend-ui.md`, `docs/contracts/unified-note-surface.md`, `docs/contracts/app-note-model.md`, `docs/contracts/api-events.md`, `docs/contracts/memory.md`, `docs/contracts/operation-return-contract.md`
関連 app-local contract: `apps/web/docs/ui-surface-contract.md`

## Summary

この record は active policy ではない。実装前には `docs/contracts/**` と `apps/web/docs/ui-surface-contract.md` を優先する。

この UI は、汎用的な AI メモアプリ、AI chat app、Notion clone、graph-first PKM、古い SaaS dashboard を目指さない。ただし「実際に書く面」は、現代のユーザーが迷わず使える Notion-like な block editor surface に寄せる。

目指す UI:

```text
ユーザーが一度離れた思考に、
整理された入口から素早く戻り、
そのまま次の input に入れる writing surface。
```

「眠っている間に整理される」は思想を説明する比喩であり、夜・朝・睡眠・時刻 scheduler を UI 機能として露出するという意味ではない。UI に露出するべき本質は、非同期に整理され、再開時の input が速くなる体験である。

## Visual Thesis

UI は管理画面ではなく、同じ note surface 上に複数の layer が現れる living writing surface として設計する。base layer は Notion-like な document surface であり、タイトル、editable blocks、空行 placeholder、Markdown-compatible shortcuts が最初に理解できる。

```text
base layer: Notion-like な書く面
return layer: 戻ってきた整理
assist layer: 承認待ちではなく、自動で差し込まれる AI 補助
carried context layer: 持ち越す文脈
provenance layer: 必要なときだけ開く出典
```

ページを増やすより、同じ note surface の上で layer を制御する。情報を詰め込むのではなく、再入力に必要な順序で情報を出す。

## Product Feel

目指す質感:

- premium editor。
- ambient annotation。
- living document。
- minimal chrome。
- calm but alive。
- OSS として思想が読み取れる UI。
- Notion-like な書き始めやすさ。ただし database / property / relation 設計を主役にしない。

避けるもの:

- 左 navigation、中央 editor、右 AI panel という汎用 SaaS layout を主構成にすること。
- dashboard widget、KPI card、table-heavy review queue。
- 常設 AI chat panel。
- graph view を primary UI にすること。
- 大量の card stack で情報量を多く見せること。
- marketing hero、decorative gradient、blob、stock image。
- 日本の業務 SaaS 的な情報詰め込み。

## Page And Layer Model

MVP のページは少なく、layer が深い構成にする。

```text
/notes
  Re-entry oriented note list

/notes/:noteId
  Unified note surface
    - writing surface
    - re-entry surface
    - return layer
    - inline AI assist
    - carried context tray
    - provenance peek
```

`/notes/:noteId` が主戦場である。`/notes` は管理 dashboard ではなく、最近の思考に戻るための薄い入口に留める。

## Target UI Composition

この section は、今後の実装が目指すべき UI 構成を wireframe として固定する。見た目を完全に指定するものではないが、screen hierarchy、writing surface の位置、AI layer の出し方はこの構成を基準にする。

### 1. Base Writing Surface

目的:

ユーザーが迷わず「ここにメモを書く」と理解できる第一画面。Notion-like な document surface を採用するが、database / property / relation UI は主役にしない。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ANN                │                                                          │
│                    │  プロダクト UI の方向性                                  │
│ 最近               │                                                          │
│ ┌────────────────┐ │  ここに書く                                              │
│ │ 現在のノート   │ │  │                                                       │
│ └────────────────┘ │                                                          │
│ AI補助のあり方     │  UI は AI のすごさを見せるものではない。                  │
│ メモリの扱い       │  自然に書いた思考が失われず、後から整理されて戻る。        │
│ 構造化の境界       │                                                          │
│                    │  +                                                       │
│ ⌕  ⚙              │                                                          │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

必須:

- 中央 document surface が最も強い。
- note title、editable block、empty placeholder、cursor が first viewport で見える。
- Markdown-compatible shortcuts は visible mode ではなく、自然な入力として働く。
- 左 rail は navigation ではなく recent thought index として薄く扱う。

### 2. Returned Organization Inline

目的:

次回オープン時の digest を overlay / dashboard ではなく、本文冒頭の collapsible organization として返す。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ANN                │                                                          │
│ 最近               │  プロダクト UI の方向性                                  │
│ 現在のノート       │                                                          │
│ AI補助のあり方     │  ┌────────────────────────────────────────────────────┐  │
│ メモリの扱い       │  │ 前回からの整理  3件                              ▾ │  │
│ 構造化の境界       │  │ 01 AI はチャットではなく本文内に戻る               │  │
│                    │  │ 02 書く面を最優先にする                           │  │
│                    │  │ 03 Markdown は入力体験であり SoT ではない          │  │
│                    │  └────────────────────────────────────────────────────┘  │
│                    │                                                          │
│                    │  ここに書く                                              │
│                    │  │                                                       │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

必須:

- digest は本文の前に置けるが、document surface を隠さない。
- 最大 3 件、各 item は短く。
- `あとで見る` / `閉じる` で writing に戻れる。
- `本文に反映` は backend command boundary ができるまで出さない。

### 3. Active Writing

目的:

通常執筆中は AI / memory / provenance を主張させず、書くことだけに集中できる状態にする。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ANN                │                                                          │
│ 最近               │  プロダクト UI の方向性                                  │
│ 現在のノート       │                                                          │
│                    │  UI は AI のすごさを見せるものではない。                  │
│                    │  書くことを妨げず、整理された思考が自然に戻ってくる。      │
│                    │                                                          │
│                    │  ## 書く面の原則                                         │
│                    │  ユーザー本文が source of truth である。                  │
│                    │  │                                                       │
│                    │                                                          │
│                    │  +                                                       │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

必須:

- user-authored blocks が最も強い。
- block controls は hover / focus 時にだけ出す。
- save / dirty / failed は控えめだが見える。
- AI insertion や digest refresh は cursor / IME composition / draft を壊さない。

### 4. Inline AI Assist

目的:

AI output を承認待ち queue ではなく、note 内に自動で差し込まれる AI-origin block として扱う。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ANN                │                                                          │
│ 最近               │  プロダクト UI の方向性                                  │
│ 現在のノート       │                                                          │
│                    │  UI は AI のすごさを見せるものではない。                  │
│                    │  書く面の中に静かに補助知能が現れる。                    │
│                    │                                                          │
│                    │  ┌────────────────────────────────────────────────────┐  │
│                    │  │ AI補助                                             │  │
│                    │  │ 「再入力を速くする Surface」を優先するとよい。      │  │
│                    │  │ 出典   編集   削除                                 │  │
│                    │  └────────────────────────────────────────────────────┘  │
│                    │                                                          │
│                    │  │                                                       │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

必須:

- AI Assist は `採用` を必須にしない。
- AI-origin label、left rule / tint、source availability を持つ。
- 操作は `出典`、`編集`、`削除` を基本にする。
- user-authored block と同化させない。
- AI は既存 user-authored block を silent rewrite しない。

### 5. Provenance Peek

目的:

出典確認は信頼のために必要だが、常設 panel にせず、必要時だけ note surface 上に小さく出す。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│ ANN                │                                                          │
│ 最近               │  プロダクト UI の方向性                                  │
│ 現在のノート       │                                                          │
│                    │  ┌────────────────────────────────────────────────────┐  │
│                    │  │ AI補助                                             │  │
│                    │  │ 「再入力を速くする Surface」を優先するとよい。      │  │
│                    │  │ 出典   編集   削除                                 │  │
│                    │  └────────────────────────────────────────────────────┘  │
│                    │                                      ┌───────────────┐   │
│                    │                                      │ 出典の確認    │   │
│                    │                                      │ 前回のノート  │   │
│                    │                                      │ 3箇所         │   │
│                    │                                      └───────────────┘   │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

必須:

- popover / peek / small sheet として出す。
- source note title、bounded excerpt、source count を見せる。
- source がない場合は `出典なし` / unavailable state を出す。
- full note / full workspace dump を出さない。

### 6. Mobile Composition

目的:

mobile でも note surface が AI UI の背後に隠れず、書く面が第一優先であることを守る。

```text
┌────────────────────────────┐
│ ANN        検索   …        │
├────────────────────────────┤
│ プロダクト UI の方向性      │
│                            │
│ ここに書く                 │
│ │                          │
│                            │
│ UI は AI のすごさを...      │
│                            │
│ ┌────────────────────────┐ │
│ │ 前回からの整理 3件   ▾ │ │
│ └────────────────────────┘ │
│                            │
│ ┌────────────────────────┐ │
│ │ AI補助                 │ │
│ │ 出典 編集 削除         │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

必須:

- sidebar は drawer / compact top bar に退避する。
- writing surface を first viewport から押し出さない。
- return layer / AI assist / provenance は stacked inline、bottom sheet、popover のいずれかにする。
- fixed bottom tray が本文入力を隠す場合は使わない。

## Reference Screen Compositions

この section は 2026-05-21 時点の UI concept image を言語化したものである。画像そのものではなく、実装時に守るべき構成・情報量・layer の関係を記録する。

### 1. 思考に戻る

役割:

離れていた thought に戻るための re-entry surface。dashboard ではなく、現在の thought へ再入場する入口。

画面構成:

```text
thin rail
  - app mark
  - 最近
  - recent thought list
  - search / settings icons

main surface
  - note title
  - 前回から整理された入口
  - 3 件以内の re-entry direction
  - ここから続ける cursor action
  - minimal overflow action
```

必要情報:

- note title。
- recent thought list: title + updated label。
- re-entry heading: `前回から整理された入口`。
- direction title。
- direction one-line explanation。
- direction affordance: small icon / chevron。
- primary writing action: `ここから続ける`。

情報量:

- direction は 3 件まで。
- 各 direction は 2 行以内。
- provenance、raw confidence、job detail は出さない。

Design intent:

- note list ではなく「戻る入口」に見えること。
- 最も強い affordance は navigation ではなく `ここから続ける`。
- AI の存在を主張せず、整理された thought direction として見せる。

### 2. 書く面

役割:

ユーザーがそのまま input できる base writing surface。

画面構成:

```text
thin rail
  - recent thought list

top chrome
  - back / forward controls
  - share / overflow

note surface
  - note title
  - empty editable block / placeholder
  - lightweight return status
  - user-authored paragraphs
  - active cursor
  - Markdown-compatible shortcuts
```

必要情報:

- note title。
- empty block placeholder: `ここに書く` / `ここから書く`。
- lightweight status: `整理済みの入口あり`, `昨日の更新から` など。ただし時刻比喩を機能名化しない。
- user-authored paragraph text。
- active cursor / focus position。
- save state が変化した場合の minimal status。
- Markdown shortcut affordance は visible mode switcher ではなく、自然な入力として働く。

情報量:

- AI assist、memory candidate、provenance は default では出さない。
- user-authored text と cursor が最も重要。

Design intent:

- 「書ける」ことが一目でわかる。
- 書く場所は中央の document surface であり、迷わせない。
- right AI panel を置かない。
- chrome は薄く、note title と本文が主役。
- AI は status として控えめに存在し、入力を邪魔しない。
- Markdown は入力体験であり、内部 SoT ではない。

### 3. 戻ってきた整理

役割:

digest を notification / dashboard ではなく、note に戻ってきた整理として提示する return layer。

画面構成:

```text
base note surface
  - note title and body remain visible behind / around the layer

return layer
  - small label: 前回からの整理
  - summary heading
  - numbered organized points, max 3
  - primary action for the current implementation slice: あとで見る
  - dismiss action: 閉じる
  - deferred backend-command action: 本文に反映
```

必要情報:

- return layer label。
- summary: `未整理だった論点を、3つにまとめました` など。
- organized point title。
- organized point explanation。
- actions in the current implementation slice: `あとで見る`, `閉じる`。
- future action once a backend command boundary exists: `本文に反映`。
- pending / failed state for reflection action は `本文に反映` を実装する slice で追加する。

情報量:

- organized point は 3 件まで。
- source detail は layer 上では畳み、必要時に provenance peek に逃がす。
- modal 的に画面全体を塞がない。

Design intent:

- 「整理が返ってきた」ことを感じるが、writing を止めない。
- return layer は soft sheet として現れ、閉じると note に戻れる。
- `本文に反映` は backend command boundary ができるまで UI に出さない。frontend が canonical mutation を判断しない。

### 4. 提案と文脈

役割:

AI assist、provenance、carried context を同じ note surface に統合する。AI chat でも memory 管理画面でもない。

画面構成:

```text
note surface
  - note title
  - user-authored paragraphs
  - inline AI assist block
    - AI補助 label
    - proposal text
    - 出典 affordance
    - 出典 / 編集 / 削除 actions
  - active cursor

provenance peek
  - 出典の確認
  - source note list / count
  - すべて表示

carried context tray
  - 持ち越す文脈
  - candidate count
  - candidate statement
  - source affordance
  - 覚える / 保留 / 捨てる actions
```

必要情報:

- AI assist body。
- AI-origin label: `AI補助`。
- source affordance: `出典`。
- memory candidate statement。
- memory candidate source preview / source availability。
- actions: `出典`, `編集`, `削除`, `覚える`, `保留`, `捨てる`。
- action pending / failed state。

情報量:

- inline AI assist は 1 件ずつ読める量にする。
- carried context tray は 1-3 件まで。
- provenance peek は small popover / sheet に留める。
- note body と active cursor を隠さない。

Design intent:

- AI assist は user text と同じ世界にいるが、canonical user text とは明確に違う。
- memory candidate は admin queue ではなく「今後に持ち越す文脈」。
- provenance は trust surface だが、常時主役にしない。
- user は proposal / memory を処理しなくても writing を続けられる。

## Color System

配色は「静かな高密度」ではなく「余白の質が高い、集中できる writing instrument」として設計する。

### Core Palette

| Token | 用途 | 推奨値 |
| --- | --- | --- |
| `canvas` | app 背景 | `#F7F4EE` |
| `surface` | note 面 / main surface | `#FFFCF7` |
| `surface-subtle` | rail / secondary strip | `#F1EEE7` |
| `surface-raised` | return layer / tray / popover | `rgba(255, 252, 247, 0.92)` |
| `ink` | primary text | `#211E1A` |
| `ink-muted` | secondary text | `#6E675F` |
| `ink-faint` | metadata / timestamps | `#9A9288` |
| `hairline` | separator | `rgba(33, 30, 26, 0.10)` |
| `hairline-strong` | active separator | `rgba(33, 30, 26, 0.18)` |
| `accent` | AI / return accent | `#9B7A44` |
| `accent-soft` | AI surface tint | `#F4E9D6` |
| `focus` | keyboard focus | `#3F6E8F` |
| `danger` | destructive state | `#9F3A32` |
| `success` | remembered / resolved state | `#4E6F4E` |
| `warning` | held / pending attention | `#9C6B1F` |

### Palette Rules

- App 全体を青や紫の SaaS palette に寄せない。
- Accent は「AI っぽさ」ではなく、「戻ってきた整理」「出典」「提案」を示す控えめな記号として使う。
- State は色だけで表現しない。label、icon、position、copy でも区別する。
- AI-origin content は `accent` / `accent-soft` / left rule / small label を組み合わせる。
- destructive action は常時赤く主張させない。danger は確認時・失敗時・hover/focus 時に限定する。

## Typography

日本語 UI で、editor と product chrome が混ざっても破綻しない typography を前提にする。

推奨:

- UI font: system sans-serif。
- Note title: 28-36px, regular to medium, letter spacing 0。
- Section heading: 18-22px, medium。
- Body text: 15-16px, line-height 1.75-1.9。
- Metadata: 11-12px, line-height 1.4。
- Button label: 12-13px。

Rules:

- viewport width に応じた font-size scaling はしない。
- letter spacing は 0 を基本にする。
- 大きい type は note title と re-entry title に限定する。
- panel / tray / assist block 内の heading は小さく保つ。

## Spatial System

UI chrome は薄く、writing surface の余白で品質を出す。

推奨:

- App outer padding: 16-24px。
- Thin rail width: 168-216px。
- Main note max width: 720-860px。
- Main note top padding: 56-88px。
- Paragraph gap: 18-26px。
- Section gap: 40-56px。
- Inline assist block vertical padding: 14-18px。
- Return layer width: 520-640px。
- Tray height: 88-144px。
- Popover width: 260-360px。

Rules:

- note body は画面中央に置くが、完全な document viewer になりすぎない。
- rail は navigation ではなく recent thought index として扱う。
- 右 panel 常設を default にしない。
- layer は overlay / inline / tray / peek として短時間または文脈内に出す。
- nested card は避ける。repeated candidate item だけ薄い containment を許可する。

## Required Surfaces

### 1. Re-entry Surface

目的:

一度離れた thought に、整理された入口から戻る。

表示場所:

- `/notes` の primary content。
- または `/notes/:noteId` の初回 open 時の note 上部。

必要情報:

- current note title。
- last edited / updated metadata。
- re-entry heading: `前回から整理された入口`。
- 1-3 個の thought direction。
- 各 direction の短い explanation。
- primary action: `ここから続ける`。
- optional secondary action: `整理を見る`, `閉じる`。
- unavailable state: `戻ってきた整理はまだありません`。

情報量制限:

- direction は最大 3 件。
- 1 direction は title 1 行 + explanation 1 行まで。
- source / provenance はここでは常時展開しない。

### 2. Writing Surface

目的:

ユーザーがすぐ input できる主 surface。

必要情報:

- note title。
- user-authored blocks。
- section heading。
- active cursor / focused block。
- save state: saved / dirty / saving / failed。
- lightweight return status: `整理済みの入口あり` など。
- block-level affordance: handle, insert, delete など。ただし常時主張しない。

Rules:

- user-authored block は最も視覚的に強い。
- AI / digest / memory は writing を押しのけない。
- focus、selection、IME composition、dirty draft を維持する。

### 3. Return Layer

目的:

digest を dashboard list ではなく、note に戻ってきた整理として見せる。

必要情報:

- label: `前回からの整理` または `戻ってきた整理`。
- summary sentence。
- 1-3 個の organized point。
- changed / recovered / prepared metadata がある場合は控えめに表示。
- actions:
  - `あとで見る`
  - `閉じる`
  - deferred: `本文に反映`
- unavailable / empty state。
- failed state。

Rules:

- note surface を完全に隠さない。
- modal ではなく soft translucent sheet / integrated strip を default とする。
- user が typing 中なら自動で focus を奪わない。
- source は必要時に provenance peek へ逃がす。

### 4. Inline AI Assist

目的:

AI output を chat ではなく、note 内の AI-origin block として扱う。AI補助はユーザーの個別承認を必須にせず、整理された内容が自然に note surface へ戻ってくる体験を優先する。

必要情報:

- proposal body。
- AI-origin label: `AI補助`。
- source / provenance affordance: `出典`。
- confidence / policy が product-visible な場合は控えめに表示。
- actions:
  - `出典`
  - `編集`
  - `削除` or `閉じる`
- pending / failed state for each action。

Visual:

- subtle left accent rule。
- `accent-soft` tint。
- user text より少し小さい metadata。
- body は読めるが、canonical user text と同一に見せない。

Rules:

- frontend は AI-origin block を canonical user-authored block に昇格したと判断しない。
- AI補助は承認待ち UI にしない。`採用` を primary happy path として要求しない。
- 編集・削除は backend command / operation boundary、または projection-local edit boundary に送る。
- source がない場合、fake source を作らず `出典なし` または unavailable state を出す。

### 5. Carried Context Tray

目的:

memory candidate を管理 queue ではなく、今後に持ち越す文脈として確認する。

必要情報:

- label: `持ち越す文脈`。
- candidate count。
- candidate statement。
- source preview。
- status / confidence が product-visible な場合の控えめな表示。
- actions:
  - `覚える`
  - `保留`
  - `捨てる`
  - optional `編集`
- pending / failed state。

情報量制限:

- tray では 1-3 件まで。
- 大量候補は list ではなく progressive reveal。
- default は note を隠さない bottom tray / margin tray。

Rules:

- memory は hidden profiling に見せない。
- source-backed であることを UI 上で確認できる。
- user が明示的に remember / hold / reject できる。

### 6. Provenance Peek

目的:

AI assist / return layer / memory candidate がなぜ戻ってきたかを必要時に確認する。

必要情報:

- source note title。
- source block / section preview。
- source count。
- link or action: `すべて表示`。
- missing state。

Rules:

- 常設 panel ではなく peek / popover / small sheet を default とする。
- trust のために inspectable だが、常に視覚的主役にしない。
- source span がない場合は捏造しない。

## Interaction Model

最重要 metric:

```text
time to first meaningful input
```

ユーザーが戻ってきてから、意味のある 1 文を書き始めるまでの距離を最短化する。

Interaction rules:

- `ここから続ける` は cursor を適切な block に置く。
- empty document / empty block はすぐ書ける placeholder を持つ。
- Markdown-compatible shortcuts は block editor 内で自然に動き、Markdown mode switcher を作らない。
- return layer は閉じられる。
- inline AI補助は承認しなくても writing を継続できる。
- carried context tray は保留できる。
- provenance は peek で開き、閉じると元の focus に戻る。
- keyboard navigation で主要 action に到達できる。
- pending state 中も note draft を失わない。

## Information Density

情報量は多く見せるのではなく、再入力に必要な順序で出す。

表示順:

1. note title / current thought。
2. editable writing area。
3. re-entry direction。
4. returned organization。
5. AI補助 action。
6. carried context。
7. provenance detail。

Default で隠してよいもの:

- detailed source span。
- recovered job count。
- confidence raw value。
- all memory candidates。
- all operation proposals。
- low-level trigger reason。

Default で隠してはいけないもの:

- user-authored text。
- empty writing placeholder。
- whether content is AI-origin。
- primary action state。
- pending / failed state。
- source availability for AI-origin content。
- canonical save failure。

## Component Implications

必要な frontend components:

- `ThinRail`
- `RecentThoughtList`
- `ReEntrySurface`
- `ReEntryDirection`
- `NoteSurface`
- `EditableBlock`
- `MarkdownShortcutInput`
- `ReturnLayer`
- `InlineAiAssist`
- `CarriedContextTray`
- `MemoryCandidateItem`
- `ProvenancePeek`
- `ActionStatus`
- `SaveStatus`

これらは product semantics を所有しない。backend DTO を presenter が view model に変換し、component は view model と user intent callback を受け取る。

## Presenter View Model Requirements

Presenter は少なくとも次の view model を作る。

```ts
type ReEntryDirectionViewModel = {
  id: string;
  title: string;
  summary: string;
  sourceAvailable: boolean;
};

type NoteBlockViewModel =
  | { kind: "editable-user-block"; id: string; text: string; saveState: "saved" | "dirty" | "saving" | "failed" }
  | { kind: "inline-ai-assist"; id: string; text: string; sourceAvailable: boolean; actionState: "idle" | "pending" | "failed" };

type CarriedContextViewModel = {
  id: string;
  statement: string;
  sourcePreview?: string;
  actionState: "idle" | "pending" | "failed";
};
```

IDs は backend 由来でなければならない。frontend は operation ID、memory ID、provenance ID、source span ID、note ID、block ID を生成しない。
Markdown-compatible shortcuts は presenter / editor adapter が user intent として扱い、Markdown string を canonical document state として保持しない。

## Visual Stop Conditions

次の場合は design / contract alignment を見直す。

- 画面が generic SaaS dashboard に見える。
- AI が chat panel として主役になる。
- note surface より navigation / panel / card が強い。
- re-entry surface が notification feed に見える。
- return layer が modal dialog として writing を止める。
- memory candidate が CRM queue / admin list に見える。
- source / provenance が常時表示されすぎて writing を邪魔する。
- information density は高いが、first meaningful input が遅くなる。
- UI が backend に presentation-only field を要求する。

## 2026-05-22 Revision: Background Organization First

この UI 方針は、MVP では AI 補助を前景化しない方向へ更新する。ユーザーは AI を操作するのではなく、ただ書く。Agent は note leave / tab switch / app leave 後にバックグラウンドで思考を整理し、次回オープン時に compact な「前回からの整理」として返す。

- 書いている最中は AI 補助、memory candidate、整理結果を割り込ませない。
- Top bar は原則として保存状態だけを静かに示し、AI が走っている感を強く出さない。
- Primary surface は Notion-like な writing surface であり、整理結果は next-open digest として本文冒頭に控えめに出す。
- Inline projection が必要な場合も label は `AI補助` ではなく `整理された文脈` / `続きの入口` / `持ち越された文脈` とする。
- Memory candidate は入力直後に出さず、整理結果の secondary projection として digest / tray に控えめに出す。
- Provenance は「AI を信用させる」ためではなく、整理結果の出典を確認してユーザーが判断を取り戻すために置く。
