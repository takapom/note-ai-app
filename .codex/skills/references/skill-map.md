# 保守性 Skill Map

複数の保守性懸念が同時に見えるときに読む。

## 入口

- `maintainability-review-router`: どの保守性 skill を主軸にするか選ぶ。
- `change-locality`: 変更が無関係な場所へ広がる。
- `responsibility-placement`: owner が不明、または「これはどこに置くべきか」を判断する。
- `knowledge-cohesion`: 知識が重複、分散、または関連 behavior から離れている。

## 構造と依存方向

- `dependency-stability`: stable policy が volatile detail に依存している。
- `boundary-design`: module/API boundary が曖昧、leaky、または不足している。
- `invariant-protection`: invalid state、順序 rule、permission、consistency rule が caller の注意に依存している。

## 振る舞いと実行時の力

- `side-effect-containment`: I/O、time、randomness、mutation、network、DB、framework call、global state が広く漏れている。
- `error-meaning`: failure が domain meaning を保たずに catch、throw、log、map されている。

## 表現と進化

- `abstraction-timing`: abstract、duplicate、inline、wait のどれを選ぶか判断する。
- `naming-as-intent`: name が intent、unit、state、responsibility を伝えていない。
- `testability-as-design`: tests が脆い、書きにくい、または behavior を守っていない。
- `incremental-refactoring`: 危険な rewrite なしに構造を改善する。

## よく使う順序

- suspicious diff の review: `maintainability-review-router` -> focused skill -> `testability-as-design`。
- misplaced logic の移動: `responsibility-placement` -> `dependency-stability` -> `boundary-design`。
- 危険な duplication の整理: `knowledge-cohesion` -> `abstraction-timing` -> `testability-as-design`。
- risky behavior の安定化: `invariant-protection` -> `side-effect-containment` -> `error-meaning`。
- legacy code の refactor: `incremental-refactoring` -> focused skill -> `testability-as-design`。
