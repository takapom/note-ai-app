# 出力テンプレート

抽出した AI Native Note domain model 候補を提案するときにこの template を使う。source material で裏付けられる section だけを埋める。可能なら owner contract と live contract file を引用する。

```markdown
# ドメインモデル抽出: {bounded context または workflow}

## 対象範囲

- 分析した sources: {contracts、live contract files、tests、scaffold code}
- workflow: {writing、note close、tab switch、app leave、next open、manual organize、memory review、operation routing}
- 参照した authority: {docs/contracts file}
- 参照した live semantics: {contexts/*/src/contract file}

## SoT と projection

| 表面 | 分類 | 理由 |
| --- | --- | --- |
| user-authored blocks | source of truth | primary note text |
| AI semantic units | projection | 再生成可能で source-backed |
| Memory candidate | projection pending review | provenance と status が必要 |
| Generated docs | projection/evidence | policy を所有しない |

## Context 境界

- 名前: {Note Model | Scheduler | Context Assembly | Memory | AI Operations | Operation Router | Runtime}
- owner contract: `{docs/contracts/...}`
- live contract: `{contexts/.../src/contract/...}`
- 所有するもの: {language、lifecycle、invariants}
- 所有してはいけないもの: {neighbor context policies、UI styling、persistence mechanics、provider choice}

## Aggregate 候補

### {AggregateName}

- root: {root name}
- 責務: {1 文で責務を書く}
- 一貫性境界: {one command の直後に即時 valid でなければならないこと}
- identity: {必要な ids}
- lifecycle/status: {該当する場合}
- 内部 entities/value objects: {該当する場合}
- context をまたぐ参照: {ids または snapshots のみ}

```pseudo
Aggregate {AggregateName} {
  id: {AggregateName}Id
  workspaceId: WorkspaceId

  // この context が所有する local state。
  status: {Status}
  sourceRefs: List<SourceSpan>

  // 不変条件:
  // - {invalid state that cannot exist}
  // - {status transition rule}
  // - {source/provenance rule}

  static create(input): Result<{AggregateName}, DomainError>
  commandName(input): Result<{AggregateName}, DomainError>
}
```

### 境界での拒否メモ

- aggregate ではないもの: {projection/helper/adapter}
- 理由: {lifecycle がない、true invariant がない、または別 context が所有する}

## Value Object 候補

| 名前 | フィールド | 検証 | 所有者 |
| --- | --- | --- | --- |
| SourceSpan | sourceBlockId, startOffset, endOffset | non-empty id、offset の順序 | AI Operations または Context Assembly |
| ContextBudget | max characters、K limits | positive limits、強制される truncation | Context Assembly |
| Confidence | value | 0..1 かつ threshold aware | AI Operations |

## Domain Policy または Service

| 名前 | 所有者 | 入力 | 出力 | 補足 |
| --- | --- | --- | --- | --- |
| {PolicyName} | {context} | {ids/snapshots} | {decision/event} | {one entity が所有しない理由} |

## テストすべき不変条件

- {invalid input} は {contract/domain object} によって rejected される。
- {forbidden trigger or status transition} は {aggregate/result} を作れない。
- {projection} は required review または policy path なしに source of truth になれない。
- {cross-context reference} は ID または bounded snapshot のままである。

## 許可される依存関係

- 読み取り元: {contracts または allowed context contracts}
- 出力先: {operation、event、audit、projection、adapter}
- 禁止される近道: {direct DB/UI/provider mutation、shared invariant package、projection-as-authority}

## 最初の実装 slice

- contract test を追加または更新する: `{test path or lane}`
- live semantics を追加する: `{contexts/.../src/contract/...}`
- owning context の中にだけ minimal domain helper を追加する: `{path}`
- 検証コマンド: `{docs/contracts/verification-lanes.md または task prompt の command}`

## 非目標

- {mvp-scope.md で除外された scope}
- {neighbor context responsibility}
- {contract が許可していない migration bridge または dual-write}
```

## 命名ガイド

AI Native Note の言葉を優先する:

- `NoteDocument`, `Section`, `Block`, `StableChunk`.
- `StructureJob`, `DirtyScope`, `ContextHash`.
- `ContextEnvelope`, `NoteCard`, `RelatedContext`, `MemoryContext`.
- `MemoryItem`, `MemoryCandidate`, `SourceProvenance`.
- `StructureOperation`, `SourceSpan`, `Confidence`.
- `AuditRecord`, `ApplyDecision`.

Note/Scheduler/Context/Operation の用語がある場合は、無関係な domain の placeholder name を避ける。
