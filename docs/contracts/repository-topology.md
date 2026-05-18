# リポジトリトポロジー契約

ドキュメント種別: contract  
権威: layer connections の信頼できる唯一の情報源  
オーナー: アーキテクチャオーナー  
付随契約: authority-graph.md, product-principles.md, cloudflare-agents-turso.md  
生成済み companion: docs/generated/authority-graph.json  
検証レーン: topology-review skill  
ステータス: active

## 目的

agents が layers を opportunistic に接続できないよう、allowed topology を固定する。

## この契約が所有するもの


- Layer responsibilities。
- Allowed dependency direction。
- Forbidden shortcuts。
- apps、contexts、runtime、generated projections、docs 間の boundary rules。


## この契約が所有しないもの


- Specific package manager choice。
- Exact UI component hierarchy。
- Cloudflare deployment values。


## 不変条件


- `contexts/*/src/contract/*` は live product semantics を所有する。
- `apps/web` は note-surface contracts を利用して UI をレンダリングする。document semantics は所有しない。
- `apps/worker` は HTTP、auth、Agents、AI SDK calls、Turso access を route する。product policy は所有しない。
- Cloudflare Agents は stateful scheduling/session/job buffers を所有する。
- Turso は canonical persistent data を所有する。
- Agent-local SQL は canonical note data ではなく temporary state を所有する。
- Operation Router は AI operations の validation/policy/apply boundary である。
- Context Assembly は AI に渡す情報の最小化 boundary である。
- Generated artifacts は upstream decisions を所有しない。


## 許可されるトポロジー


Authority edges:
- `docs/contracts/**` -> `contexts/*/src/contract/*`。
- `docs/contracts/repository-topology.md` -> `docs/generated/authority-graph.json`。
- `docs/contracts/api-events.md` -> `apps/workspace-api/generated/openapi.json`。

Import / runtime dependency edges:
- `apps/web` -> `contexts/*/src/contract/*`。
- `apps/web` -> `apps/worker` API。
- `apps/worker` -> `contexts/*/src/contract/*`。
- `apps/worker` -> Cloudflare Agents -> Turso。
- `apps/worker` note structure route handler -> `apps/worker` scheduler runtime flow。
- `apps/worker` scheduler runtime flow -> `SchedulerNoteSnapshotPort` -> Turso canonical sections / Agent-local dirty section marks。
- `contexts/scheduler` -> `contexts/note-model` for section snapshots only。
- `contexts/context-assembly` -> `contexts/note-model` for note-card semantics。
- `contexts/context-assembly` -> `contexts/memory` for context-eligible memory semantics。
- StructureJob queue -> `apps/worker` context assembly runtime flow -> Context Assembly contract -> valid ContextEnvelope -> AI Engine / provider registry -> operation generation provider -> `apps/worker` structure job operation orchestration flow -> completed StructureJob response。
- `apps/worker` StructureJob Agent handler -> `apps/worker` context assembly runtime flow / `apps/worker` structure job operation orchestration flow。
- `apps/worker` context assembly runtime flow -> `ContextAssemblyTargetSnapshotPort` -> Turso canonical notes / sections / blocks。
- `apps/worker` context assembly runtime flow -> `ContextAssemblyLocalStructurePort` -> semantic unit projections。
- `apps/worker` context assembly runtime flow -> `ContextAssemblyRelatedContextRetrievalPort` -> semantic unit projections / Turso canonical note and block excerpts。
- `apps/worker` context assembly runtime flow -> `ContextAssemblyMemoryRetrievalPort` -> user-scoped memory projections。
- `contexts/ai-operations` -> `contexts/note-model` for block origin and AI block vocabulary。
- `contexts/ai-operations` -> `contexts/memory` for memory type vocabulary。
- completed StructureJob response -> structure job operation flow -> runtime operation routing adapter -> Operation Router -> semantic unit projections / memory candidate projections / assist block projections。

Contexts must not import from `apps/*` or generated projections. Apps and runtime adapters consume context contracts; they do not own product policy. AI SDK は runtime adapter boundaries の背後で呼び出される。


## 移行用の seam

Temporary adapters は宣言済みの runtime boundaries にのみ存在してよい。デフォルトで dual-write はしない。

## 削除対象

reason-to-change owner なしに invariants を所有する shared convenience packages を削除する。

## ガード / 検証

2 つ以上の layers に触れる PRs では topology review を実行する。
