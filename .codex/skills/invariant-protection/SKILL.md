---
name: invariant-protection
description: >-
  重要な rule、valid state、権限、順序制約、limit、transition、整合性要件が、caller の注意、comment、散らばった validation、または tests だけで守られているときに使う。
---

# 不変条件の保護

## Core question

どの invalid state や invalid operation を、構造で防ぐ、拒否する、または表現しにくくするべきか。

## First principle

重要な制約は人間の記憶だけに依存させない。rule 破りの影響が大きい、繰り返される、または将来変更で起きやすいなら、type、constructor、module API、state transition function、boundary validation、behavior test で守る。

## When to use

non-empty ID、valid span、ordered timestamp、allowed transition、permission、limit、相互に整合する fields などを code が仮定しているときに使う。

具体例: comment に「must call X first」とある。check が caller に copy されている。type が impossible state を許す。invalid input から遠い場所で runtime error が出る。tests が happy path だけを cover している。

## When not to use

すべての primitive を wrap したり、軽微な前提を複雑な type に encode したりしない。構造化するのは、影響が大きい、繰り返される、boundary を越える、変更に弱い constraint に限る。

## What to inspect

- constructor、validator、factory function、public API。
- state type と transition function。
- nullable/optional field と impossible combination。
- user、file、DB、network、provider、UI からの boundary input。
- invalid state と rejected operation の tests。

## Decision flow

1. invariant と、それが破られた場合の cost を名付ける。
2. invalid data が入る場所を探す。
3. boundary で reject するか、normalize するか、invalid state を表現不能にするか決める。
4. enforcement は各 caller ではなく rule owner に置く。
5. failure meaning は `error-meaning` で見えるようにする。
6. rejection と valid transition の tests を追加する。

## Design discipline

実際に保守価値がある constraint だけを守る。目的は type 技巧の最大化ではなく、将来 code が重要 rule をうっかり bypass できないようにすること。

## Anti-patterns

- **Validation scatter**: caller ごとに微妙に異なる check を行い drift する。
- **Comment invariant**: 正しさが safe API ではなく note を読むことに依存する。
- **Boolean state soup**: boolean の組み合わせで impossible state が作れる。
- **Over-modeled primitive**: costly mistake を防がない wrapper が ceremony だけを増やす。

## Review checklist

- 絶対に起きてはいけない state は何か。
- invalid input は今 construct または pass できるか。
- rule は owner が守っているか、caller が守っているか。
- happy path だけでなく invalid case が test されているか。
- enforcement は有用な failure meaning を保っているか。

## Bad / Good examples

Bad:

```ts
type Job = { status: "pending" | "running" | "done"; completedAt?: Date };
```

Good:

```ts
type Job =
  | { status: "pending" }
  | { status: "running"; startedAt: Date }
  | { status: "done"; startedAt: Date; completedAt: Date };
```

## Refactoring guidance

invalid value が入る boundary から始める。現在の accepted/rejected case を characterization test で固定する。小さな constructor または transition function を導入する。caller を移行する。invalid path の test が揃うまで duplicated check は消さない。

## Output expectations

invariant、現在の enforcement gap、提案する structural protection、rejected cases、変更 files、valid/invalid behavior の test cases を出力する。

## Related skills

enforcement の置き場所は `boundary-design`。state や unit の名前は `naming-as-intent`。invalid case の証明は `testability-as-design`。
