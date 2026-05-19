# 保守性判断シナリオ

保守性 skill が正しい懸念へ route し、code だけでなく判断理由を出せるか評価するために使う。

## シナリオ 1: policy に provider detail が漏れている

プロンプト:

```text
この変更を review してください。retry rule が OpenAI SDK error code を note structuring policy の中で直接 check するようになりました。
```

期待する skill routing:

- Primary: `dependency-stability`
- Secondary: `error-meaning`, `testability-as-design`

期待する判断理由:

- stable retry policy が volatile provider taxonomy に依存している。
- provider code は adapter boundary で stable failure reason に map するべき。
- tests は provider SDK なしで retry behavior を assert するべき。

失敗の兆候:

- boundary を特定せず generic `ErrorService` を提案する。
- style issue としてだけ扱う。

## シナリオ 2: 同じ値だが意味が異なる重複 rule

プロンプト:

```text
2 つの module がどちらも 5000 という limit を使っています。shared constants に移すべきですか。
```

期待する skill routing:

- Primary: `abstraction-timing`
- Secondary: `knowledge-cohesion`, `naming-as-intent`

期待する判断理由:

- まず両方の値が同じ理由で変わるか確認する。
- 片方が context token budget、もう片方が UI preview character limit なら分けたまま明確に名付ける。
- 1 つの product rule を表すなら rule owner に移す。

失敗の兆候:

- 自動的に `MAX_LIMIT = 5000` を抽出する。
- 意味を確認せず自動的に duplication を残す。

## シナリオ 3: validation が caller に散らばっている

プロンプト:

```text
複数 caller が operation 作成前に source span start が end より前か check しています。
```

期待する skill routing:

- Primary: `invariant-protection`
- Secondary: `boundary-design`, `testability-as-design`

期待する判断理由:

- valid source span は caller etiquette ではなく invariant。
- construction または operation boundary で enforce する。
- invalid span rejection と valid span acceptance の tests を追加する。

失敗の兆候:

- さらに caller-side `if` を追加する。
- ownership のない generic utility に check を隠す。

## シナリオ 4: 大きな legacy cleanup

プロンプト:

```text
この module は UI state、API call、note operation decision を混ぜています。maintainable にしてください。
```

期待する skill routing:

- Primary: `incremental-refactoring`
- Secondary: `responsibility-placement`, `side-effect-containment`, `change-locality`

期待する判断理由:

- current behavior の characterization から始める。
- 最初に pure decision 1 つ、または side-effect boundary 1 つを抽出する。
- behavior と structure を同時に大きく変える rewrite を避ける。

失敗の兆候:

- 完全な architecture replacement を提案する。
- tests や staged migration なしに code を移動する。

## シナリオ 5: test が internal function をすべて mock している

プロンプト:

```text
refactor 後に behavior test が壊れました。5 つの internal function が順番に呼ばれることを期待していたためです。
```

期待する skill routing:

- Primary: `testability-as-design`
- Secondary: `side-effect-containment`, `boundary-design`

期待する判断理由:

- test が implementation choreography に結合している。
- call sequence 自体が contract でない限り、stable boundary の behavior を assert する。
- setup が大きいなら side effect と boundary shape を調べる。

失敗の兆候:

- contract を問わず mock sequence だけを更新する。
- behavior coverage を置き換えず test を削除する。
