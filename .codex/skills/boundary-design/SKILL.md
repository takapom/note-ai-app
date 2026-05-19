---
name: boundary-design
description: >-
  module/API boundary を作る、調整する、または既存 boundary を尊重するか決めるときに使う。特に caller が internal を誤用できる、detail が layer を越えて漏れる、提案 boundary が不要な architecture になりそうな場合に使う。
---

# 境界設計

## Core question

この boundary は、何を許可し、何を隠し、何を拒否し、何を約束すべきか。

## First principle

boundary は folder ではない。有用な boundary は ownership を守る。stable behavior を公開し、volatile detail を隠し、caller が internal に依存するのを防ぐ。悪い boundary は将来変更の cost を下げずに indirection だけを増やす。

## When to use

public function、port、module export、adapter、service API、package boundary、policy と detail の間の interface を導入するときに使う。

具体例: caller が internal state に触っている。module が everything export している。新しい adapter が提案されている。helper が context を跨いで使われている。function の正しい利用に caller が ordering rule を知る必要がある。

## When not to use

caller が 1 つで、変更理由が 1 つで、隠すべき重要な invariant や volatile detail がない code を boundary で囲まない。boundary pressure が出るまで単純に保つ。

## What to inspect

- export された symbol と public API。
- caller と、caller が知る必要のある assumption。
- caller に漏れている internal state。
- validation と error contract。
- internal に依存する tests。
- 提案 boundary を跨ぐ dependency direction。

## Decision flow

1. boundary の背後にある owner を名付ける。
2. caller が何を知ってよいか決める。
3. volatile representation と internal sequencing を隠す。
4. owner が守れる invalid input は拒否するか表現不能にする。
5. observed variation または behavior に結びついた testing seam がない限り interface を避ける。
6. name、type、behavior test で promise を表現する。

## Design discipline

internal data shape ではなく behavior と stable concept を公開する。boundary は caller knowledge を減らすべきであり、正しい ritual を caller に組み立てさせてはいけない。

## Anti-patterns

- **Export everything**: caller が internal に結合し、内部変更がすべて public change になる。
- **Thin boundary leak**: API はあるが DB row、SDK error、mutable state が漏れている。
- **Interface before variation**: 実際の substitution force がないのに ceremony を増やす。
- **Caller ritual**: 正しさが関数呼び出し順に依存する。

## Review checklist

- boundary は何を約束するか。
- 何を意図的に隠すか。
- caller は誤用できるか。
- caller が知るべきことを減らしているか、増やしているか。
- invalid state は boundary で拒否されるか。
- tests は可能な限り public behavior 経由で書かれているか。

## Bad / Good examples

Bad:

```ts
store.setStatus("closed");
store.flush();
store.reindex();
```

Good:

```ts
store.closeDocument(documentId);
```

## Refactoring guidance

まず caller assumption を特定する。その assumption を所有する狭い behavior method を追加する。caller を 1 つ移行する。既存 internal は private にするか transitional として扱う。old access を消す前に新 boundary 経由の tests を追加する。

## Output expectations

boundary owner、public promise、hidden details、rejected inputs、migration plan、boundary を target にする tests を示す。

## Related skills

policy と detail を分けるなら `dependency-stability`。validity を守る boundary なら `invariant-protection`。public interface を増やす前に `abstraction-timing`。
