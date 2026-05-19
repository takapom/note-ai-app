---
name: dependency-stability
description: >-
  安定した policy、業務上の意味、状態遷移、不変条件が、UI、DB schema、framework API、外部 provider、通信形式、生成 client、library behavior など変わりやすい detail に依存しているときに使う。
---

# 依存の安定性

## Core question

依存はより安定した知識へ向いているか。それとも変わりやすい detail が policy を支配しているか。

## First principle

detail は core meaning より頻繁に変わる。安定した policy が変わりやすい detail に依存すると、provider、schema、UI、framework の変更が business rule まで書き換えさせ、system を脆くする。

## When to use

product decision が SDK type、DB row、request object、UI props、framework object を直接 import または受け取っているときに使う。

具体例: domain code が route handler type を import する。policy が raw ORM record を受け取る。UI state が許可される transition を決める。provider error code が stable API に漏れる。storage format 名が core rule に現れる。

## When not to use

すべての library call に adapter を作らない。volatile detail が孤立していて risk が低く、policy authority を持たないなら direct use の方が単純で保守しやすい場合がある。

## What to inspect

- stable module と volatile module の import direction。
- policy/model code の function signature。
- DTO、ORM、SDK、framework、generated type が boundary を越える場所。
- mapping code と、それが実行される場所。
- stable rule の確認に framework/provider setup が必要な tests。

## Decision flow

1. 各 dependency を stable policy か volatile detail か分類する。
2. stable code が volatile detail を import しているなら、借りている知識が何か確認する。
3. stable code が stable value だけを必要とするなら mapping を edge に移す。
4. 狭い input shape は、推測された未来ではなく stable meaning を表す場合だけ定義する。
5. volatile error が boundary を越えるなら `error-meaning`。
6. separation に API が必要なら `boundary-design`。

## Design discipline

volatile vocabulary は edge に閉じ込める。stable module は request、row、component、SDK、transport ではなく product/domain の言葉で話す。

## Anti-patterns

- **SDK-shaped policy**: vendor 変更が core decision を書き換えさせる。
- **Database-shaped domain**: persistence column が behavior の言語になる。
- **Framework import creep**: stable module の test に runtime scaffold が必要になる。
- **Adapter theater**: wrapper はあるが volatile vocabulary がすべて漏れている。

## Review checklist

- stable code が volatile detail を import していないか。
- function signature が transport、storage、UI、vendor 語彙を不要に公開していないか。
- mapping は detail に最も近い boundary にあるか。
- provider や schema の置換が policy edit を要求しないか。
- stable behavior は volatile runtime なしで test できるか。

## Bad / Good examples

Bad:

```ts
function canRetry(error: ProviderSdkError) {
  return error.code === "rate_limit_exceeded";
}
```

Good:

```ts
function canRetry(reason: FailureReason) {
  return reason.kind === "rate-limited";
}
```

## Refactoring guidance

volatile data が入る boundary で狭い stable value を導入する。volatile detail は 1 回だけ map する。old caller を動かしたまま stable code を新しい shape へ移す。provider/framework setup なしで policy behavior を証明してから leaked import を消す。

## Output expectations

volatile dependencies、影響を受ける stable policy、提案 boundary mapping、変更 files、over-wrapping のリスク、volatile infrastructure なしで動く tests を示す。

## Related skills

detail が ownership を奪っている場合は `responsibility-placement` の後に使う。API の形は `boundary-design`、provider/runtime failure mapping は `error-meaning`。
