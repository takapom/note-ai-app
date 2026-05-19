---
name: testability-as-design
description: >-
  tests が書きにくい、脆い、implementation detail に密結合している、過剰な setup が必要、重要 behavior を守っていない、または design が保守可能かを tests から判断したいときに使う。
---

# 設計としてのテスト容易性

## Core question

この code はどの behavior を約束しているか。その design は、その behavior を観測しやすくしているか。

## First principle

test は設計の観測装置である。behavior が test しづらいなら、責務が曖昧、依存が不安定、副作用が広すぎる、重要な state が隠れている可能性がある。良い test は implementation trivia ではなく behavior を記述し、将来変更を守る。

## When to use

実装前後の test scope 判断、refactoring、または単純な behavior check に test suite が抵抗するときに使う。

具体例: tests が多くの internal mock を必要とする。単純な rule の確認に full app rendering が必要。private call を assert している。setup が behavior より大きい。failure case が未 test。behavior が変わっていない refactor で多くの tests が変わる。

## When not to use

test が少し不便だからといって全体を redesign しない。adapter behavior が integration setup を必要とするのは正当な場合がある。test は risk に比例させる。

## What to inspect

- 変更 behavior の周辺 tests。
- public behavior boundary と observable output。
- setup size、mock、fixture、assertion。
- side effects と external dependencies。
- failure と invalid input tests。
- test name と domain vocabulary。

## Decision flow

1. behavior promise を user/domain の言葉で言う。
2. その behavior を観測できる最も狭い boundary を選ぶ。
3. setup が過剰なら responsibility と side effect を調べる。
4. tests が internal を assert しているなら、output、state change、event、stable call への assertion に移す。
5. 未知の code を refactor する前に characterization test を置く。
6. constraint や error が重要なら invalid/failure tests を追加する。

## Design discipline

test は将来変更後も真であるべきことを記述する。path 自体が contract でない限り、incidental implementation path を固定しない。

## Anti-patterns

- **Mock choreography**: private call の順序を assert し、無害な refactor を妨げる。
- **Only happy path**: 重要 constraint が静かに regression する。
- **Fixture mountain**: behavior が大量の無関係 state に依存し、boundary の曖昧さを示す。
- **Snapshot as contract**: 大きな snapshot が重要 behavior を隠す。

## Review checklist

- tests は守る behavior を名前付けしているか。
- 正当な refactor が test rewrite を要求しないか。
- 意味ある invalid/failure path が covered か。
- stable logic は volatile infrastructure なしで test できるか。
- test の難しさが曖昧な責務や副作用を示していないか。

## Bad / Good examples

Bad:

```ts
expect(repository.save).toHaveBeenCalledWith({ status: "approved" });
```

Good:

```ts
expect(result).toEqual({ approved: true });
expect(await store.find(order.id)).toMatchObject({ status: "approved" });
```

## Refactoring guidance

現在の public boundary に characterization test を追加する。behavior が固定されてから code を抽出または移動する。implementation-coupled assertion を behavior assertion に段階的に置き換える。effect boundary には少数の adapter/integration test を残す。

## Output expectations

behavior promises、推奨 test boundary、missing cases、test 困難さが示す design smell、具体的な test 追加/修正を出力する。

## Related skills

どの focused skill の後にも使う。tests が infrastructure を要求するなら `side-effect-containment`、構造変更前なら `incremental-refactoring` と組み合わせる。
