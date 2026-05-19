---
name: incremental-refactoring
description: >-
  保守しやすい理想形が現在安全に行える変更より大きいとき、legacy code を rewrite なしで改善したいとき、または既存 repo context を尊重して behavior を保つ refactoring 順序を選ぶ必要があるときに使う。
---

# 段階的リファクタリング

## Core question

behavior を失わずに、変更の局所性が高い構造へ近づける最小の安全な手順は何か。

## First principle

大きな rewrite は、構造を改善するより先に知識を破壊しやすい。保守的な refactoring は、既存 behavior を観測し、保護し、責務を 1 つずつ移動し、将来変更がより局所化されたか確認する。

## When to use

focused skill が本物の問題を見つけたが、理想の fix が task に対して大きすぎるときに使う。

具体例: mixed responsibilities を持つ legacy module。危険な broad rename。tests がない。boundary migration が危険。散らばった validation の置換。effectful workflow から policy を抽出する。

## When not to use

現在の変更が重大な invariant、data loss、security risk を深めるなら、incrementalism を言い訳にしない。high-impact risk は直接直す。ただし手順は慎重に分ける。

## What to inspect

- current behavior と available tests。
- callers と integration points。
- unrelated pending changes がある files。
- repo 内に既にある natural seams。
- risky side effects、transactions、failure paths。
- verification commands。

## Decision flow

1. 目指す maintainability improvement を名付ける。
2. existing tests または characterization tests で current behavior を固定する。
3. 1 つの小さな move を選ぶ: rename、pure decision の抽出、boundary method 追加、rule 1 つの統合、dependency 1 つの mapping。
4. migration 中も old public behavior を動かす。
5. 各 step の後に verify する。
6. 現在の task の future change が十分 local になったら止め、より大きな cleanup は明示的に defer する。

## Design discipline

repo の現在の形を尊重する。scope、contract、無関係な behavior を黙って変えず、次の変更経路を改善する。

## Anti-patterns

- **Rewrite leap**: behavior change と structure change が大量に同時に入り、review と rollback が難しくなる。
- **Half boundary**: 新 path を追加したが old unsafe path も同じように public のまま残り、migration note がない。
- **Refactor without characterization**: behavior が accidental に変わっても検知できない。
- **Cleanup sprawl**: 無関係な style change が重要な structural move を隠す。

## Review checklist

- code を動かす前に behavior は固定されているか。
- 各 step は reviewable で reversible か。
- 無関係な変更を除外しているか。
- 結果は名前付けされた future change を改善しているか。
- 残る risk は隠さず記録されているか。

## Bad / Good examples

Bad:

```text
workflow 全体を置き換え、全 module を rename し、tests も同時に更新する。
```

Good:

```text
まず approval outcome の characterization tests を追加する。次に approval decision を DB write から抽出する。最後に caller を新しい decision API へ移す。
```

## Refactoring guidance

default の順序: behavior を characterize する、decision を 1 つ isolate する、明確に name する、重要 constraint を守る、caller を移す、dead path を消す、その後に abstraction を検討する。可能なら意味のある step ごとに verification を走らせる。

## Output expectations

staged plan、最初の safe edit、behavior tests、rollback risk、step ごとの affected files、意図的に defer するものを出力する。

## Related skills

問題を診断した skill の後に使う。最後に `testability-as-design` で新しい構造が保護されているか確認する。
