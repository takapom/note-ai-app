---
name: error-meaning
description: >-
  failure が throw、catch、log、retry、変換、boundary 越しの公開をされるときに、volatile implementation detail を漏らさず caller に failure の意味を保って伝える必要がある場合に使う。
---

# エラーの意味

## Core question

この boundary において、この failure は何を意味し、caller はそれに対して何ができるべきか。

## First principle

error は behavior contract の一部である。failure が string、log、provider code、generic exception だけで表されると、将来の caller は安全に扱えず、変わりやすい detail が stable code に漏れる。

## When to use

provider error の mapping、retry behavior、result type、catch block、API error return を設計または review するときに使う。

具体例: `catch (e) { return null }`。provider error code が domain code に露出する。すべての failure が 500 になる。validation failure と infrastructure failure が同じ型になる。なぜ失敗したかが log にしか残らない。

## When not to use

local で recover 不能な programming mistake に大きな error hierarchy を作らない。caller が意味ある action を取れない bug は、明確に fail させてよい。

## What to inspect

- throw/catch site と result type。
- provider、DB、framework、policy、UI/API の boundary crossing。
- retry、fallback、user-visible messaging。
- log と observability fields。
- failure case の tests。

## Decision flow

1. failure を受け取る相手を特定する。
2. receiver が取れる action を確認する: retry、input reject、approval request、message display、compensation、abort。
3. volatile error は boundary で stable failure meaning に map する。
4. debugging に必要な detail は保つが、stable policy の一部にはしない。
5. caller action が異なるなら validation、conflict、permission、unavailable、bug failure を分ける。
6. meaningful failure path を test する。

## Design discipline

failure は受け取る boundary の言葉で表現する。low-level error vocabulary を product policy にしない。

## Anti-patterns

- **Swallow and default**: 壊れた behavior を隠し、後の failure を不可解にする。
- **Stringly errors**: caller が message を parse し、文言に結合する。
- **Provider code leak**: stable code が vendor taxonomy に依存する。
- **One generic failure**: caller が retryable、invalid、forbidden、conflict を区別できない。

## Review checklist

- caller はこの failure に対して何ができるか。
- volatile detail は stable boundary を越える前に map されているか。
- debug detail は policy にならずに保たれているか。
- caller action が異なる failure が区別されているか。
- 重要な failure decision が少なくとも 1 つ test されているか。

## Bad / Good examples

Bad:

```ts
catch (error) {
  return { ok: false, message: String(error) };
}
```

Good:

```ts
catch (error) {
  return { ok: false, reason: mapProviderFailure(error), cause: error };
}
```

## Refactoring guidance

既存 failure path と caller action を一覧化する。boundary に stable failure reason を導入する。caller を string/provider check から reason check に移す。広い error handling を変える前に、最も重要な failure decision の test を追加する。

## Output expectations

failure sources、stable meanings、caller actions、mapping boundary、削除すべき leaked details、meaningful failure behavior の tests を出力する。

## Related skills

I/O failure は `side-effect-containment`、provider detail leak は `dependency-stability`、public API の error contract は `boundary-design`。
