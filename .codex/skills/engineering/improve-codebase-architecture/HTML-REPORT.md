# HTML レポート形式

アーキテクチャレビューは、OS の一時ディレクトリに置く単一の自己完結 HTML ファイルとして描画し日本語で説明文は書くこと。Tailwind と Mermaid はどちらも CDN から読み込む。Mermaid はグラフ状の図を安定して扱う。手作りの div と inline SVG は、より編集的なビジュアルに使う。例: mass diagram、cross-section。両方を混ぜる。すべてを Mermaid に寄せすぎないこと。汎用的に見え始める。

## Scaffold

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>アーキテクチャレビュー - {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* Tailwind だけではきれいに扱いにくい小さな custom layer:
         破線の継ぎ目、手描き感のある矢印の先端など。 */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

repo name、date、compact legend を置く。solid box = モジュール、dashed line = 継ぎ目、red arrow = leakage、thick dark box = 深いモジュール。導入段落は不要。候補へ直行する。

## Candidate card

図が主役である。文章は少なく、平易にし、[LANGUAGE.md](LANGUAGE.md) の用語集にある語を大げさにせず使う。

各候補は 1 つの `<article>` にする。

- **Title** — 短く、深化の名前を付ける。例: "Collapse the Order intake pipeline"。
- **Badge row** — recommendation strength。`Strong` = emerald、`Worth exploring` = amber、`Speculative` = slate。さらに依存カテゴリの tag を付ける。`in-process`、`local-substitutable`、`ports & adapters`、`mock`。
- **Files** — monospaced list。`font-mono text-sm`。
- **Before / After diagram** — 中心要素。左右 2 columns。pattern は下記を参照。
- **Problem** — 1 文。何が痛いか。
- **Solution** — 1 文。何を変えるか。
- **Wins** — bullets。各 bullet は 6 words 以下。例: "Tests hit one interface"、"Pricing logic stops leaking"、"Delete 4 shallow wrappers"。
- **ADR callout** (該当する場合) — amber 系の box に 1 行。

説明段落は不要。図を理解するのに段落が必要なら、図を描き直す。

## Diagram patterns

候補に合う pattern を選ぶ。混ぜて使う。すべての図を同じ見た目にしない。多様性も目的の一部である。

### Mermaid graph (依存や call flow の主力)

要点が "X calls Y calls Z, and look at the mess." なら Mermaid の `flowchart` や `graph` を使う。唐突に見えないよう、Tailwind でスタイルした card に包む。`classDef` で leakage edge を赤くし、深いモジュールを暗くする。sequence diagram は "before: 6 round-trips; after: 1." によく合う。

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### 手作りの boxes-and-arrows (Mermaid の layout が邪魔なとき)

モジュールは border と label を持つ `<div>` として描く。矢印は inline SVG の `<line>` や `<path>` を relative container 上に absolute 配置する。after 図を、太い border の深いモジュール 1 つとして見せ、その内側の要素を greyed-out にしたい場合はこちらを使う。Mermaid では適切な重みで描けない。

### Cross-section (layered shallowness に向く)

水平 band (`h-12 border-l-4`) を積み、call が通過する layer を示す。before は何もしない 6 つの薄い layer。after は統合された責務で label 付けした 1 つの厚い band。

### Mass diagram (「インターフェースが実装と同じくらい広い」に向く)

モジュールごとに 2 つの rectangle を置く。1 つは interface surface area、もう 1 つは implementation。before は interface rectangle が implementation rectangle とほぼ同じ高さになる。つまり浅い。after は interface rectangle が低く、implementation rectangle が高い。つまり深い。

### Call-graph collapse

before は、function call の tree を nested boxes として描く。after は同じ tree を 1 つの box に畳み込み、内部化された call はその中で faded 表示する。

## Style guidance

- corporate-dashboard ではなく、editorial 寄りにする。余白を広く取る。見出しには serif も任意で使ってよい。`font-serif` は stone/slate と相性がよい。
- 色は控えめに使う。accent は emerald または indigo の 1 つ、leakage は red、warning は amber。
- 図はおおむね 320px tall に保つ。before/after が side by side で快適に収まり、scroll せずに読めるようにする。
- 図中の module label には `text-xs uppercase tracking-wider` を使う。UI ではなく schematic として読ませる。
- script は Tailwind CDN と Mermaid ESM import だけにする。それ以外は静的な report にする。app code は入れず、Mermaid 自身の rendering 以外の interactivity も入れない。

## Top recommendation section

大きめの card を 1 つ置く。candidate name、その理由を 1 文、その card への anchor link。それだけでよい。

## Tone

平易な英語で、簡潔に書く。ただし、アーキテクチャ上の名詞と動詞は [LANGUAGE.md](LANGUAGE.md) からそのまま使う。簡潔さを理由に語彙を崩さない。

**必ず使う:** モジュール、インターフェース、実装、深さ、深い、浅い、継ぎ目、アダプター、レバレッジ、局所性。

**置き換え禁止:** component、service、unit (module の意味で) · API、signature (interface の意味で) · boundary (seam の意味で) · layer、wrapper (module の意味で使っている場合)。

**style に合う phrasing:**

- "Order intake module is shallow — interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen: one interface, one place to test."
- "Two adapters justify the seam: HTTP in prod, in-memory in tests."

**Wins bullets** では、用語集の語で gain を名付ける。例: _"locality: bugs concentrate in one module"_、_"leverage: one interface, N call sites"_、_"interface shrinks; implementation absorbs the wrappers"_。_"easier to maintain"_ や _"cleaner code"_ とは書かない。これらは用語集の語ではなく、使う価値を自力で稼いでいない。

hedging、前置き、"it's worth noting that..." は不要。文にできる bullet は bullet にする。削れる bullet は削る。語が [LANGUAGE.md](LANGUAGE.md) にないなら、新しい語を作る前に、そこにある語を探す。
