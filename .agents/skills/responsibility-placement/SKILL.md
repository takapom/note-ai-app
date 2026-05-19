---
name: responsibility-placement
description: >-
  code や知識をどこに置くべきか不明なとき、controller/service/helper に default で logic を押し込んでいるとき、責務を layer 名ではなく変更理由から判断したいときに使う。
---

# 責務の配置

## Core question

この知識は、同じ理由で変わるどの code が所有すべきか。

## First principle

責務とは変更理由である。runtime 上は似た処理でも、変わる理由が違えば分けるべきである。runtime 上は違う処理でも、1 つの要求で常に一緒に変わるなら近くに置くべきである。良い配置は将来の編集場所を明確にする。

## When to use

logic を追加するときに、候補が handler、service、model、repository、component、helper などで、owner が明確でない場合に使う。

具体例: validation が複数 caller に追加される。service method が product policy と DB mapping を混ぜる。UI component が business eligibility を判断する。helper 名が domain meaning を隠している。

## When not to use

小さな code を verb ごとに module 分割しない。変更理由が local で、risk が低く、再発の圧力がないなら、caller の近くに置いたままにする。

## What to inspect

- 要求と、将来なぜ変わる可能性があるか。
- 近くの module と既存の変更理由。
- 関連する state、rule、name、test の現在の owner。
- ここに置くと新しい caller が知る必要のある decision。
- domain knowledge を隠している framework、DB、UI details。

## Decision flow

1. 「この code は ... のとき変わる」と言語化する。
2. その理由で既に変わる module を探す。
3. 存在しなければ、最も安定した関連知識の近くに初版を置く。
4. logic が 2 つの理由を混ぜているなら、decision と transport/mapping/rendering detail を分ける。
5. 移動に新しい boundary が必要なら、追加前に `boundary-design` を確認する。
6. rule が valid state を守るなら `invariant-protection` を確認する。

## Design discipline

framework 上の位置に ownership を決めさせない。handler は orchestration、repository は persistence、component は rendering を担ってよいが、product meaning はその lifecycle と invariant の owner に置く。

## Anti-patterns

- **Everything service**: service が無関係な変更理由の物置になり、何を所有するのか分からなくなる。
- **Utils escape hatch**: domain knowledge が context を失い、前提が間違った場所で reuse される。
- **Nearest file wins**: 編集しやすい場所に置くことで将来変更が非局所化する。
- **Layer purity theater**: layer 名を満たすために移動するが、変更理由の混在は残る。

## Review checklist

- この code がなぜ変わるか名付けられるか。
- 置かれた module はその理由を既に所有しているか。
- 無関係な変更理由が結合されていないか。
- 変わりやすい detail が安定した policy を支配していないか。
- 新しい caller がこの知識を重複実装する必要はないか。

## Bad / Good examples

Bad:

```ts
// HTTP handler 内
if (request.body.total > 0 && user.plan !== "free") approve();
```

Good:

```ts
const approval = subscriptionPolicy.evaluateOrder(user.plan, orderTotal);
if (approval.allowed) approve();
```

## Refactoring guidance

まず旧 call site に狭い wrapper を残し、振る舞いを変えない。owner が明確な decision だけを移す。data mapping と side effect は edge に残す。test 名を behavior に寄せ、caller 側の重複 logic を消す。

## Output expectations

変更理由、選んだ owner、caller に残すもの、移すもの、移してはいけないもの、移動を守る behavior tests を説明する。

## Related skills

広がりが misplaced owner を示す場合は `change-locality` の後に使う。ownership が UI/DB/framework detail に歪められているなら `dependency-stability`。関連知識が分断されているなら `knowledge-cohesion`。
