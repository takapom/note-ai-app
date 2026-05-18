# 分析ヒューリスティック

`../_shared/ai-native-note-bounded-contexts.md` を読んだ後に使う。目的は、projection を source of truth として扱わずに、contracts、live contract files、tests、scaffold code から domain model 候補を抽出すること。

## 権威の手がかり

| 手がかり | 解釈 |
| --- | --- |
| `docs/contracts/*.md` の owner field | rule の policy owner と source of truth |
| `contexts/*/src/contract/*` | implementation と tests が満たすべき live semantics |
| `docs/generated/**` | projection または evidence。decision の owner ではない |
| UI routes と components | note-surface contracts の consumer。document semantics の owner ではない |
| Worker/provider/Turso code | runtime または persistence boundary。domain policy の owner ではない |
| `ai_native_note_requirements.md` | input material のみ。implementation 前に decision を contracts に反映する |

## Aggregate 候補の発見

| 手がかり | 候補 |
| --- | --- |
| status transition と immediate invariant を持つ lifecycle | aggregate root または entity |
| command が invalid identity、scope、status、source reference を即時拒否する必要がある | aggregate または value object |
| child record の集合が parent document の中でだけ意味を持つ | parent aggregate 内の local entity |
| cross-context data が id または bounded snapshot として十分安定している | direct aggregate ownership ではなく ID reference |
| result が policy、error、source span をまとめて記録する必要がある | audit または decision aggregate/value object |

AI Native Note の例:

- Note Model: `NoteDocument` は `Section` と `Block` の consistency を所有できる。Section/Block semantics は internal document semantics だからである。
- Scheduler: `StructureJob` は trigger reason、target scope、status、context hash、priority、dedupe state を所有できる。
- Context Assembly: `ContextEnvelope` は budget/K limits、trust boundary、target scope、note card、related context、memory context inputs を所有できる。
- Memory: `MemoryItem` は type、status、source provenance、activation eligibility を所有できる。
- AI Operations: `StructureOperation` は operation type、source spans、confidence、target shape、schema validity を所有できる。
- Operation Router: `AuditRecord` と `ApplyDecision` は route outcome、policy classification、safe application result、rejection reason を所有できる。

## Value Object 候補の発見

| 手がかり | 候補 |
| --- | --- |
| string ID が context 間で混ざる | boundary での branded id または value object |
| hash value が dedupe や dirty state の比較に使われる | content hash value |
| offset pair が user-authored source text を指す | source span value object |
| numeric limit に上限/下限が必要 | budget、K limit、confidence、timestamp primitive |
| 小さな finite status set が behavior を駆動する | status value または enum |

boundary 内で invalid value が危険な場合は domain primitive を優先する: empty IDs、negative offsets、end before start、NaN timestamps、0..1 外の confidence、missing context hash、unknown status。

## Domain Service と Policy の発見

| 手がかり | 候補 |
| --- | --- |
| rule が複数 aggregate にまたがり、どちらにも所有できない | domain service または policy object |
| runtime adapter が provider、transport、storage を選ぶ | domain service ではなく adapter |
| operation policy が apply/propose/reject behavior を分類する | Operation Router policy |
| context retrieval が related notes、semantic units、memory を rank する | Context Assembly policy |

contract が stronger consistency を明示的に許可しない限り、cross-aggregate rule は operation、event、audit、projection boundary に留める。

## Projection の検出

contract が別途定めない限り、次を projection として扱う:

- Markdown import/export text。
- AI-generated semantic units、summaries、relations、memory candidates、assist blocks。
- next-open digest data。
- generated register files。
- Superset task files と review notes。
- GitHub issue/PR descriptions。

projection の手がかり:

- user-authored blocks または source-backed records から再生成できる。
- confidence、provenance、source span metadata を持つ。
- canonical user text へ黙って昇格せず、review 用に表示される。
- rejection または deletion 後に context から除外される。

## 指摘すべきアンチパターン

- `apps/web` が heading を render するという理由で section boundary semantics を定義する。
- AI SDK や database に近いという理由で `apps/worker` が operation policy を定義する。
- shared module が複数 bounded context の ids、statuses、invariants を所有する。
- Context Assembly が full workspace content を AI provider に渡す。
- Scheduler が block change ごとに AI を起動する。
- Operation Router が validation と audit なしに raw model output を DB/UI へ直接適用する。
- Memory が source provenance または必要な user approval なしに active になる。
