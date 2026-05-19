---
name: abstraction-timing
description: >-
  abstraction、interface、helper、shared module、generic type、common workflow を導入すべきか決めるとき、または duplication が有害な反復なのか有用な観測なのか判断するときに使う。
---

# 抽象化のタイミング

## Core question

この抽象化は観測された variation に基づいているか。それともまだ現れていない未来を予測しているだけか。

## First principle

抽象化は観測された変化の後に行う。variation が見える前の抽象化は、本当の差分を隠し、将来変更を難しくしやすい。変化の軸を学ぶまでは duplication が有用な場合がある。

## When to use

code が重複している、helper/interface が提案されている、将来の case に備えて module を generalize しようとしているときに使う。

具体例: 「別 provider が必要になるかもしれない」。helper が多くの flag を受け取る。interface の実装が 1 つしかない。common code が caller から behavior hook を要求する。似た 2 つの function を merge しようとしている。

## When not to use

critical rule の危険な duplication を正当化するために使わない。同じ変更理由を持ち drift が危険な重複知識なら、`knowledge-cohesion` で統合する。

## What to inspect

- concrete case の数と違い方。
- 各 case の変更履歴。
- 提案 abstraction の flag、callback、generic、optional parameter。
- shared behavior と case-specific behavior を説明する tests。
- common knowledge の ownership。

## Decision flow

1. repeated shape と repeated knowledge を分けて特定する。
2. 少なくとも 2 つの concrete case が存在するか確認する。
3. 各 case がなぜ変わるか比較する。
4. 変更理由が違うなら duplication を残すか、名前を明確にする。
5. 変更理由が同じで差分が安定しているなら、狭い shared behavior を抽出する。
6. abstraction に多くの flag が必要なら、まだ軸が見えていない。
7. common behavior と case-specific behavior の test を置く。

## Design discipline

variation が観測されるまで concrete code を優先する。抽象化するなら incidental mechanics ではなく stable decision を抽象化する。

## Anti-patterns

- **One-implementation interface**: 実際の substitution force がないのに indirection を増やす。
- **Flag-powered helper**: caller が hidden mode を知る必要があり、helper が多くの理由で変わる。
- **Premature provider abstraction**: provider 差分が分かる前に least-common-denominator API を作る。
- **DRY over meaning**: text similarity が distinct responsibility を上書きする。

## Review checklist

- どの concrete variation が存在するか。
- 本当に共通なものは何か。似て見えるだけのものは何か。
- abstraction は将来変更を減らすか、広げるか。
- caller は簡単になったか。それとも hidden behavior を設定する必要が増えたか。
- duplication を test 付きで意図的に残して観測できるか。

## Bad / Good examples

Bad:

```ts
runWorkflow("email", { dryRun: false, retry: true, format: "html" });
```

Good:

```ts
sendWelcomeEmail(command);
```

複数 workflow が stable shared lifecycle を示すまでは concrete function を保つ。

## Refactoring guidance

duplication を残しつつ behavior を露出する tests を追加する。2 回目または 3 回目の変更後に差分を比較する。最小の common decision を抽出する。mode の変更理由が異なるなら flag を消し、明確な concrete entry point に分ける。

## Output expectations

今 abstract するか、duplication を残すか、inline するか、split するかを示す。観測された variation、risk、必要なら最小 abstraction、common と case-specific behavior を分ける tests を含める。

## Related skills

早すぎる DRY を避けるため `knowledge-cohesion` の後に使う。public interface 追加前は `boundary-design`。安全な抽出は `incremental-refactoring`。
