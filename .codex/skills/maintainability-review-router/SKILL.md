---
name: maintainability-review-router
description: >-
  実装、レビュー、リファクタリングで、変更の局所性、責務配置、依存方向、境界、不変条件、副作用、エラー、抽象化、命名、テスト、段階的改善のうち、どの保守性観点を優先すべきか選ぶときに使う。
---

# 保守性レビュー・ルーター

複数の懸念が同時に見える場合は `../references/skill-map.md` を読む。レビューコメントを書く場合は `../references/review-language.md` を読む。

## Core question

この変更を支配している保守性上の力は何か。次の判断では、どの focused skill を使うべきか。

## First principle

保守性は単一の性質ではない。将来の変更が自然に着地できるように、複数の力が揃っている状態である。最初に観点を間違えると、依存の問題をレイヤー追加で処理したり、抽象化の問題を generic helper で隠したり、不変条件の問題をコメントで済ませたりする。

## When to use

「clean up」「maintainable にする」「レビューして」「refactor」「これはどこに置くべきか」といった依頼、または diff に危険さを感じるがリスクの名前がまだ付いていないときに最初に使う。

具体的には、1 つの変更が UI、handler、service、repository、schema、tests、helper に広がっているとき、「ここに logic が多すぎる」というレビューが出たとき、複数の保守性 skill が同時に該当しそうなとき。

## When not to use

問題がすでに明確なら使わない。無効状態の問題なら `invariant-protection`、早すぎる抽象化なら `abstraction-timing` を直接使う。

## What to inspect

- ユーザーの依頼と変更理由。
- diff と変更ファイル。
- 呼び出し元、呼び出し先、module boundary、tests。
- 類似の知識が既に置かれている場所。
- UI、DB、framework、provider、filesystem、time、network、global state への依存。
- validation、状態遷移、error handling、副作用の経路。

## Decision flow

1. 変更理由を 1 文で名付ける。
2. その理由の owner が既にあるか確認する。
3. owner が不明なら `responsibility-placement`。
4. 無関係な多くの場所に広がるなら `change-locality`。
5. 同じ知識が複数表現されているなら `knowledge-cohesion`。
6. 変わりやすい detail が安定した policy を支配しているなら `dependency-stability`。
7. caller が API を誤用できるなら `boundary-design` または `invariant-protection`。
8. 振る舞いを観測・保護しづらいなら `testability-as-design`。
9. 理想の改善が大きすぎるなら `incremental-refactoring`。

## Design discipline

編集前に primary concern を 1 つ選ぶ。secondary concern は計画に反映してよいが、狭い bug fix を全面的な architecture rewrite にしない。

## Anti-patterns

- **Clean-code bucket**: 何でも「clean code」と呼ぶと、どの将来変更が危険なのか見えなくなる。
- **Pattern-first diagnosis**: 変更理由を特定する前に service、interface、factory、adapter を選ぶ。
- **Review scatter**: 構造的に diff が広がった理由を見逃し、小さな style コメントだけを並べる。

## Review checklist

- 変更理由は明確か。
- 主要な保守性リスクは名前付けされているか。
- 選んだ skill は十分に狭い観点か。
- secondary risk を記録しつつ、task scope を広げすぎていないか。
- 推奨する次の一手は現在の task に対して小さいか。

## Bad / Good examples

Bad:

```text
もっと clean にするべき。service に移す。
```

Good:

```text
routing rule は product policy が変わると変わるが、HTTP handler の中にあるため protocol 変更理由と混ざっている。responsibility-placement の後に dependency-stability を使う。
```

## Refactoring guidance

最初に code を動かさない。まずリスクを分類し、既存 test または小さな characterization test で振る舞いを固定する。primary concern を改善する最小の移動を行い、diff がより局所化されたか確認する。

## Output expectations

選んだ primary skill、必要なら secondary skills、保守性リスク、code 上の根拠、次の具体的な実装またはレビュー手順を出力する。

## Related skills

まずこの skill で入口を決め、その後 focused skill に移る。振る舞い保護は `testability-as-design`、理想形が大きすぎる場合は `incremental-refactoring` で締める。
