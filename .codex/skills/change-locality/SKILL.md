---
name: change-locality
description: >-
  1 つの変更が無関係な多くの場所へ広がるとき、1 つの要求で複数 layer/module を修正する必要があるとき、または全面 rewrite なしに将来の変更影響を小さくしたいときに使う。
---

# 変更の局所性

他の保守性 skill と組み合わせる場合は `../references/first-principles-of-maintainability.md` を読む。

## Core question

この変更には自然な置き場所があるか。それとも code 構造が変更を広げているか。

## First principle

変更は避けられない。したがって保守性は、将来の変更をどれだけ局所的に理解し修復できるかで測る。無関係な責務へ広がる変更は、知識の置き場所、依存方向、境界、または test の不足を示している。

## When to use

1 つの feature 実装で、同じ概念的理由から複数 module を編集する必要があるときに使う。小さな振る舞い変更で広範な test 更新が必要になる場合にも使う。

具体例: 同じ条件が controller、service、repository、UI にある。field rename が大量の手修正を要求する。provider 変更が product logic に届く。bug fix が複数 helper の同期編集を要求する。

## When not to use

すべてを generic facade に隠して局所化したことにしない。observability、migration、mechanical API update など、本質的に横断的な変更もある。それらは設計失敗ではなく、明示的な広範囲変更として扱う。

## What to inspect

- directory と責務ごとの diff の広がり。
- 重複した condition、mapping、validation、status handling。
- 無関係な領域で fail する tests。
- 一緒に変わりがちな files の履歴や既存 pattern。
- UI、runtime、persistence、policy boundary を跨ぐ call chain。

## Decision flow

1. 変更された各 file の変更理由を名付ける。
2. 同じ理由で変わった file を group 化する。
3. 1 file に無関係な理由が混ざるなら `responsibility-placement`。
4. 同じ知識が重複するなら `knowledge-cohesion`。
5. 変わりやすい detail が広がりの原因なら `dependency-stability`。
6. 今すぐ知識を移すか、狭い API を作るか、観測のため一時的に重複を残すか決める。
7. 将来の変更が局所化されるべき境界に behavior test を置く。

## Design discipline

file 数の最小化ではなく、次に起きそうな変更の自然な置き場所を最適化する。2 file 変更でも各 file の変更理由が明確なら保守的であり、1 file 変更でも無関係な判断が混ざれば危険である。

## Anti-patterns

- **Shotgun surgery の放置**: 小さな変更が毎回多くの file に広がり、将来の編集が遅く危険になる。
- **Centralization による見せかけの局所化**: file 数は減るが、1 つの manager に多くの変更理由が混ざる。
- **Mechanical DRY**: 構文の重複だけを消し、知識の分散を残す。

## Review checklist

- 同種の将来変更は 1 つの明確な領域で完結できるか。
- 変更 file は同じ理由で変わっているか、別理由が混ざっているか。
- 重複知識は copied、projected、intentional duplication のどれか。
- fix によって多すぎる理由で変わる新しい中心点を作っていないか。
- tests は、将来の変更が局所化されるべき境界の振る舞いを守っているか。

## Bad / Good examples

Bad:

```ts
if (provider === "x" && status === "ready") showAction();
// handler、mapper、repository に同じ条件が繰り返される
```

Good:

```ts
const decision = policy.canShowAction({ provider, status });
if (decision.allowed) showAction();
```

ただし `policy` がその product decision を所有している場合だけ良い。無関係な helper の寄せ集めなら改善ではない。

## Refactoring guidance

まず広がりを記録する: files、理由、重複知識。characterization test で振る舞いを固定する。同じ理由で変わる owner に decision を 1 つ移す。adapter は薄く保つ。test を再実行し、次の類似変更が無関係な場所へ広がらないか確認する。

## Output expectations

変更理由、現在の広がり、提案する local owner、変更対象 files、広がりを放置するリスク、振る舞いが保たれたことを示す tests を出力する。

## Related skills

`maintainability-review-router` の後に使う。owner 選択は `responsibility-placement`、重複処理は `knowledge-cohesion`、一度で直せない広がりは `incremental-refactoring` と組み合わせる。
