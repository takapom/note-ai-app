---
name: knowledge-cohesion
description: >-
  同じ rule、mapping、語彙、単位、条件、前提が複数箇所に現れるとき、または関連する state と behavior が離れていて将来の変更時に読み手が知識を手作業でつなぐ必要があるときに使う。
---

# 知識の凝集

## Core question

安全な将来変更のために一緒に理解されるべき知識は何か。それらは近くに置かれているか。

## First principle

code は知識の配置である。一緒に変わる知識は、読み手が rule 全体を局所的に見られる程度に近くに置くべきである。逆に、変更理由が異なる知識を、構文が似ているという理由だけで接着してはいけない。

## When to use

rule、unit、status の意味、field mapping、limit、validation の前提が繰り返されている、またはそれが制約する behavior から離れているときに使う。

具体例: enum/string mapping が重複している。state value と許可される transition が別々の file にある。comment が code にない rule を説明している。1 つの behavior を test するために無関係な事実を大量に setup する必要がある。

## When not to use

見た目が似ているだけで知識を統合しない。現在の値が同じでも、2 つの context の変更理由が異なるなら intentional duplication として残してよい。

## What to inspect

- 重複 literal、conditional、mapping table、validator、comment。
- type definition と raw primitive が boundary を越える場所。
- 同じ rule の setup/assertion を繰り返す tests。
- state、behavior、policy が technical type ごとに分断された directory。
- 過去に一緒に変更されがちな files。

## Decision flow

1. 重複 code ではなく、重複している知識を特定する。
2. 各 copy が同じ理由で変わるか確認する。
3. 同じなら owner に知識を移し、狭い API を公開する。
4. 違うなら duplication を残し、名前で意味の違いを明らかにする。
5. 共通性が不明なら duplication を残し、各 context の test を置いて観測する。
6. 凝集が広い依存を作るなら `dependency-stability` を確認する。

## Design discipline

rule は、それが制約する state と behavior の近くに置く。domain knowledge を、意味ではなく mechanics を表す helper に隠さない。

## Anti-patterns

- **Stringly shared knowledge**: literal が繰り返され、drift しても気づきにくく、caller が勝手に意味を作る。
- **Mapping scatter**: adapter ごとに同じ status を別々に変換する。
- **Premature common table**: 一時的に値が同じだけの 2 context を結合する。
- **Comment-owned rule**: 重要な振る舞いが実行可能な構造ではなく comment に依存する。

## Review checklist

- 同じ知識が複数箇所に表現されていないか。
- copy は同じ変更理由を共有しているか。
- 関連 state が、それを valid にする behavior から離れていないか。
- 提案された共通場所は正当な ownership を持つか。
- tests は各 duplicate 表現ではなく behavior を assert しているか。

## Bad / Good examples

Bad:

```ts
if (status === "archived") return false;
// renderer、API mapper、command handler に繰り返される
```

Good:

```ts
if (!documentStatus.canEdit(status)) return false;
```

これは `documentStatus` が editability を所有する場合だけ良い。generic enum utility なら改善ではない。

## Refactoring guidance

すべての copy を列挙し、変更理由で分類する。同じ理由の知識だけを統合する。duplicate を消す前に owner に test を追加する。意図的に残す duplication は、意味の違いが見える名前にする。

## Output expectations

見つけた知識、duplicate locations、同じ/異なる変更理由、提案 owner または intentional duplication の判断、behavior を固定する tests を出力する。

## Related skills

owner 選択には `responsibility-placement`。早すぎる DRY を避けるには `abstraction-timing`。意図的 duplication の名前を明確にするには `naming-as-intent`。
