---
name: naming-as-intent
description: >-
  name が intent、unit、ownership、state、lifecycle、failure meaning、変更理由を隠しているときに使う。特に code は短いが、読み手が何を変えてよいか安全に推測できない場合に使う。
---

# 意図としての命名

## Core question

将来変更を局所的に行うために、name はどの intent、constraint、unit、responsibility を明らかにすべきか。

## First principle

読みやすさとは局所的に理解できることである。name は構造であり、どの知識がここに属するか、どの前提が成り立つか、何を安全に変えられるかを示す。曖昧な name は隠れた context を読み手の記憶に押し付ける。

## When to use

variable、function、module、test、state、error、boolean が技術的には正しいが意味的に弱いときに使う。

具体例: `data`、`item`、`handle`、`process`、`manager`、`helper`、不明確な polarity の boolean、unit がない number、implementation を説明する test name、ownership を隠す layer-only module name。

## When not to use

好みで name churn を起こさない。repo の慣習として局所的に理解されており、risk を隠していない name は残す。

## What to inspect

- public boundary と主要 call site の names。
- boolean name と state name。
- unit、currency、time zone、limit、ID。
- test name と failure name。
- module/directory name と変更理由の対応。

## Decision flow

1. 読み手が安全に変更するために何を知る必要があるか確認する。
2. その知識が stable で local なら name に入れる。
3. ambiguity が bug につながるなら unit や lifecycle を含める。
4. 意味が重要な場合は mechanics だけを表す name を避ける。
5. test name は behavior promise にする。
6. naming が misplaced responsibility を露出したら `responsibility-placement` を使う。

## Design discipline

name は正しい編集に必要な context を減らすべきである。concept が安定しているなら generic technical verb より specific domain meaning を優先する。

## Anti-patterns

- **Manager/helper/service fog**: ownership や変更理由が name から分からない。
- **Boolean ambiguity**: `disabled`、`valid`、`active` の視点や lifecycle が曖昧。
- **Unitless numbers**: milliseconds、tokens、cents、percentages が混同される。
- **Implementation test names**: test failure が約束された behavior を説明しない。

## Review checklist

- 新しい読み手は name から役割を推測できるか。
- 必要な unit、lifecycle、ownership が name に出ているか。
- generic noun が複数責務を隠していないか。
- tests は setup ではなく behavior で名付けられているか。
- rename は diff size に見合う価値があるか。

## Bad / Good examples

Bad:

```ts
const limit = 5000;
function process(data) {}
```

Good:

```ts
const contextBudgetTokens = 5000;
function assembleContextEnvelope(sourceBlocks) {}
```

## Refactoring guidance

boundary から内側へ rename する。可能なら mechanical rename と test passing を分けて進める。必要がない限り semantic rename と behavior change を混ぜない。良い name は次の構造的 move を露出するために使い、隠すために使わない。

## Output expectations

risky names、隠れている intent、提案 name、その rename が将来変更に効く理由、今やるべきか defer すべきかを出力する。

## Related skills

診断を表現しにくいときはどの skill とも組み合わせる。unit/state には `invariant-protection`、module name には `responsibility-placement`。
