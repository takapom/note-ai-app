---
name: side-effect-containment
description: >-
  I/O、database write、network call、time、randomness、global state、mutation、logging、framework call、external provider によって behavior の理解、test、retry、局所変更が難しくなっているときに使う。
---

# 副作用の封じ込め

## Core question

core behavior を理解しやすく、test しやすく、局所的に保つために、副作用はどこで起きるべきか。

## First principle

副作用は code を time、environment、order、failure に結合する。保守性の高い code は、副作用を既知の boundary に閉じ込め、decision をできるだけ pure または explicit に保つことで、将来変更を runtime 全体なしで test できるようにする。

## When to use

logic が DB write、provider call、filesystem、timer、random ID、global mutation、framework response handling と混ざっているときに使う。

具体例: rule を test するために network/database が必要。retry が command を重複実行する。function が eligibility を判断しつつ email を送る。hidden mutation が後続 behavior を変える。

## When not to use

すべての小さな副作用をすべての logic から分離しない。adapter の目的そのものが effect で、policy が混ざっていないなら direct に保つ。

## What to inspect

- I/O と decision を同時に行う function。
- shared object や global の mutation。
- time/randomness generation。
- transaction boundary と retry behavior。
- real infrastructure を必要とする tests。
- effect 周辺の error handling。

## Decision flow

1. どちらも非自明なら「何をすべきか決める」と「実行する」を分ける。
2. effect detail は boundary または adapter に置く。
3. behavior が time/randomness に依存するなら、それらを value または狭い provider として渡す。
4. effect が繰り返される可能性があるなら ordering と idempotency を明示する。
5. failure は `error-meaning` で map する。
6. decision は effect なしで test し、adapter は focused integration test で確認する。

## Design discipline

effect の都合で policy の置き場所を決めない。副作用は name、return type、test で見えるようにする。

## Anti-patterns

- **Effectful policy**: business rule の test に DB/provider setup が必要になる。
- **Hidden mutation**: signature から何が変わるか分からない。
- **Ambient time**: 明示 input なしに clock で behavior が変わる。
- **Fire-and-forget core behavior**: failure と ordering が caller に見えない。

## Review checklist

- どの行が decision で、どの行が effect か。
- decision は external infrastructure なしで test できるか。
- side effect の順序と名前は明確か。
- 必要な場所で retry/idempotency を考慮しているか。
- failure は caller に意味を保って伝わるか。

## Bad / Good examples

Bad:

```ts
async function approve(order) {
  if (order.total > 0) await db.orders.update({ approved: true });
}
```

Good:

```ts
const decision = approvalPolicy.evaluate(order);
if (decision.approved) await orderStore.markApproved(order.id);
```

## Refactoring guidance

effect order を含む current behavior を characterization する。まず pure decision logic を抽出する。side-effect adapter は小さく保つ。pure decision と adapter/integration path をそれぞれ test する。task が要求しない限り transaction semantics は変えない。

## Output expectations

effects、decision logic、提案 containment boundary、ordering/idempotency concerns、failure mapping、decision と adapter behavior の tests を説明する。

## Related skills

provider/framework effect は `dependency-stability`、failure は `error-meaning`、effect が test を難しくしている場合は `testability-as-design` と組み合わせる。
