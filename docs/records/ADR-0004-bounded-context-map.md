# ADR-0004: 境界付けられたコンテキストマップ

ドキュメント種別: 記録。権威は `docs/contracts/**` にあります。

## 目的

現在の AI Native Note の bounded context、所有責務、依存方向を、実装者とレビュアーが短時間で把握できる形で記録します。

## 全体像

```text
docs/contracts/**
  |
  | authority / policy / topology SoT
  v
contexts/*/src/contract/*
  |
  | live product semantics
  v
apps / runtime / generated projections
```

## Context Map

```text
[Note Model]
  owns:
    - Note / Section / Block
    - H1/H2/H3 section boundary
    - user-authored blocks as source of truth
    - AI Assist Blocks as projections
    - block origin/type/content validation

  used by:
    - Scheduler
    - Context Assembly
    - AI Operations / Operation Router
    - future UI and persistence adapters

  must not own:
    - AI provider policy
    - operation routing policy
    - UI styling
```

```text
[Scheduler]
  owns:
    - BlockChanged handling
    - dirty scope lifecycle
    - structure job planning
    - allowed triggers:
      note_closed / tab_switched / app_left / next_open / manual_organize

  depends on:
    - Note Model section snapshots

  must not own:
    - operation schema
    - provider calls
    - per-keystroke AI structuring
```

```text
[Runtime Scheduler Flow]
  owns:
    - adapting BlockChanged input to scheduler contract
    - passing valid save/edit/dirty/index outputs to runtime ports
    - loading section snapshots for structure triggers
    - passing planned StructureJobs to the queue
    - preparing next_open digest intent

  depends on:
    - Scheduler contract
    - Note Model Section snapshots

  must not own:
    - trigger policy or context_hash dedupe semantics
    - provider calls
    - Operation Router calls
    - audit persistence
```

```text
[Scheduler Agent-local SQL Adapter]
  owns:
    - SQL statement mapping for BlockChanged save intent evidence
    - edit event buffer writes
    - dirty section mark writes
    - planned StructureJob queue writes
    - completed StructureJob lookup for scheduler dedupe input
    - next_open digest preparation intent writes

  depends on:
    - Runtime Scheduler Flow ports
    - Scheduler contract output

  must not own:
    - canonical Note / Section / Block persistence
    - trigger policy or context_hash computation
    - provider calls
    - Operation Router calls
    - audit persistence
```

```text
[Runtime Turso Scheduler Note Snapshot Adapter]
  owns:
    - read-only SQL mapping from canonical sections to SectionContract
    - workspace scoping through notes
    - optional Agent-local dirty mark overlay
    - infrastructure failure reporting to Scheduler runtime flow

  depends on:
    - SchedulerNoteSnapshotPort
    - Note Model SectionContract
    - Turso canonical sections
    - Agent-local dirty section marks

  must not own:
    - canonical Note / Section / Block persistence
    - dirty lifecycle writes
    - trigger policy or context_hash dedupe
    - provider calls
    - Operation Router calls
    - audit persistence
```

```text
[Context Assembly]
  owns:
    - ContextEnvelope
    - target scope
    - note card
    - local and related context top-K
    - active memory selection
    - untrusted content boundary
    - context budget

  depends on:
    - Note Model for descriptionEffective and outline
    - Memory for context-eligible memory

  must not own:
    - provider choice
    - operation validation
    - full workspace dumps
```

```text
[Runtime Context Assembly Flow]
  owns:
    - adapting StructureJob target to ContextAssemblyInput
    - invoking Context Assembly retrieval ports
    - calling Context Assembly contract assembly and validation
    - emitting valid ContextEnvelopeBuilt result

  depends on:
    - Context Assembly contract
    - runtime retrieval ports

  must not own:
    - retrieval order, K limits, budget, trust boundary
    - provider choice
    - Operation Router calls
    - audit persistence
    - canonical Note / Block writes
```

```text
[Runtime Turso Context Assembly Target Snapshot Adapter]
  owns:
    - read-only SQL mapping from canonical notes / sections / blocks
    - workspace and note scoping for target snapshots
    - note-card input mapping without trusting description_effective
    - outline row mapping for Context Assembly input
    - user-authored target block text and sourceBlockIds

  depends on:
    - ContextAssemblyTargetSnapshotPort
    - Note Model block type / origin vocabulary
    - Turso canonical notes / sections / blocks

  must not own:
    - description_effective priority
    - retrieval order, K limits, budget, trust boundary
    - semantic unit or memory retrieval
    - provider calls
    - Operation Router calls
    - audit persistence
    - canonical Note / Section / Block writes
```

```text
[Runtime Turso Context Assembly Local Structure Adapter]
  owns:
    - read-only SQL mapping from semantic unit projections
    - same-note / same-section scoping for local structure input
    - existing semantic unit row mapping
    - section summary projection row mapping
    - optional previous structure snapshot projection row mapping

  depends on:
    - ContextAssemblyLocalStructurePort
    - semantic_units projections
    - semantic_unit_section_summaries projections
    - semantic_unit_structure_snapshots projections

  must not own:
    - canonical Note / Section / Block persistence
    - target text retrieval
    - retrieval order, K limits, budget, trust boundary
    - related context or memory retrieval
    - provider calls
    - Operation Router calls
    - audit persistence
```

```text
[Runtime Turso Context Assembly Related Context Adapter]
  owns:
    - read-only SQL mapping from related semantic unit candidate projections
    - related semantic unit row mapping
    - related note-card row mapping from canonical note fields
    - explicit source block excerpt row mapping
    - full note / full workspace dump rejection

  depends on:
    - ContextAssemblyRelatedContextRetrievalPort
    - semantic_unit_related_candidates projections
    - semantic_units projections
    - Turso canonical notes for note-card fields
    - Turso canonical blocks for explicit source excerpts

  must not own:
    - workspace scanning or semantic similarity calculation
    - retrieval order policy, K limits, budget, trust boundary
    - target or local structure retrieval
    - memory retrieval
    - provider calls
    - Operation Router calls
    - audit persistence
```

```text
[Memory]
  owns:
    - MemoryItem type and status lifecycle
    - source-backed provenance
    - context eligibility
    - user actions:
      remember / edit / different / delete / hold

  used by:
    - Context Assembly
    - AI Operations vocabulary

  must not own:
    - hidden profiling
    - UI review design
    - semantic unit extraction
```

```text
[AI Operations]
  owns:
    - operation taxonomy
    - source span requirement
    - confidence requirement
    - policy classification:
      silent / inline / review / blocked

  depends on:
    - Note Model for AI block vocabulary
    - Memory for memory type vocabulary

  must not own:
    - persistence mechanics
    - UI rendering
    - provider calls
```

```text
[Operation Router]
  owns:
    - operation schema validation
    - target existence validation
    - source span validation against user-authored blocks
    - confidence threshold
    - audit record shape
    - apply / propose / reject / no_apply decision
    - revert audit boundary

  depends on:
    - AI Operations contract
    - Note Model block origin semantics

  must not own:
    - direct DB writes
    - direct UI mutation
    - provider calls
```

```text
[Runtime Operation Generation Provider Flow]
  owns:
    - adapting ContextEnvelopeBuilt + valid ContextEnvelope to provider registry requests
    - resolving a mockable operation generation provider port
    - returning completed StructureJob response and provider-independent operations payload on provider success
    - keeping provider failure and invalid runtime input away from routing, audit, and Note/Block source of truth

  depends on:
    - Runtime Context Assembly Flow event shape
    - Context Assembly validation
    - Scheduler StructureJob contract
    - provider registry boundary

  must not own:
    - Context Assembly budget / K / trust boundary semantics
    - provider SDK imports in the flow
    - operation schema or policy validation
    - Operation Router calls
    - audit persistence
    - canonical Note / Block writes
```

```text
[Runtime Structure Job Operation Orchestration Flow]
  owns:
    - sequencing operation generation provider flow before structure job operation flow
    - passing provider success completed StructureJob response to `structureJobOperationFlow`
    - forwarding `completedStructureJobResponse.aiResponse` as the downstream operation payload
    - stopping provider failure, provider unavailable, invalid runtime input, and invalid ContextEnvelope before routing/audit
    - preserving provider-independent aiResponse payload for Operation Router validation

  depends on:
    - Runtime Operation Generation Provider Flow
    - Runtime StructureJob Operation Flow

  must not own:
    - provider SDK imports
    - operation schema or policy validation
    - audit persistence semantics
    - retry / transaction behavior
    - canonical Note / Block writes
```

```text
[Runtime Turso Operation Audit Executor]
  owns:
    - ordered execution of SQL statements produced by the audit persistence adapter
    - Turso/libSQL-like client invocation
    - empty statement list rejection
    - propagation of infrastructure failures from the Turso client
    - explicit non-transactional sequential execution semantics for this slice

  depends on:
    - runtime audit persistence adapter for schema-aware SQL statement construction
    - Turso/libSQL-like client interface

  must not own:
    - hidden rollback, retry, or transaction semantics
    - operation schema interpretation
    - policy/status classification
    - routing decision mutation
    - `ai_operations` / `source_spans` field semantics
```

```text
[Runtime Operation Audit Recovery Queue]
  owns:
    - retry/recovery intent for audit persistence failure
    - stable operationId/workspaceId identity for failed audit writes
    - original audit record snapshot
    - failure message and failedAt timestamp

  depends on:
    - Operation Router audit record contract
    - runtime flow failure reporting

  must not own:
    - retry execution
    - transaction or rollback semantics
    - Turso executor invocation
    - policy/status reclassification
```

```text
[Topology / Generated Projections]
  owns:
    - allowed authority/import/runtime edges
    - generated authority graph projection
    - generated OpenAPI projection checks

  source contracts:
    - docs/contracts/repository-topology.md
    - docs/contracts/authority-graph.md
    - docs/contracts/api-events.md

  must not own:
    - product semantics
```

## Primary Flow

```text
User edits block
  -> Note Model validates block semantics
  -> Runtime Scheduler Flow calls Scheduler BlockChanged contract
  -> valid save/edit/dirty/index outputs are persisted through runtime ports
  -> dirty section marked
  -> no AI call

Note close / tab switch / app leave / manual organize
  -> Runtime Scheduler Flow loads section snapshots and completed job hashes
  -> Scheduler plans StructureJob
  -> runtime enqueues planned StructureJobs
  -> Runtime Context Assembly Flow reads bounded retrieval port snapshots
  -> Context Assembly builds bounded ContextEnvelope
  -> valid ContextEnvelopeBuilt result is emitted
  -> AI returns operation list
  -> Runtime gates on completed StructureJob response in structure job operation orchestration flow
  -> Runtime adds stable operation audit IDs
  -> Operation Router validates and classifies operations
  -> runtime boundary persists audit records through an audit persistence port
  -> audit persistence adapter maps records to ordered SQL statements
  -> Turso operation audit executor sends statements to Turso in order
  -> runtime applies/proposes/rejects projections only through approved boundaries

Non-completed StructureJob / provider failure
  -> runtime records or surfaces the runtime failure through the owning boundary
  -> no Operation Router call
  -> no Note/Block source-of-truth mutation

Audit persistence failure
  -> routing result is preserved
  -> SQL adapter or Turso executor reports an infrastructure failure
  -> current Turso executor may have partial writes because it is sequential and non-transactional
  -> runtime enqueues recovery intent when an operation audit recovery queue is provided
  -> persistence failure is handled as retry/recovery state
  -> routing decision is not rewritten by persistence
```

## Dependency Shape

```text
docs/contracts/**
  -> contexts/*/src/contract/*

apps/web
  -> contexts/*/src/contract/*
  -> apps/worker API
  -> Cloudflare Agents
  -> runtime operation routing adapter
  -> Operation Router
  -> audit persistence port
  -> Turso

contexts/scheduler
  -> contexts/note-model

apps/worker scheduler runtime flow
  -> contexts/scheduler contract
  -> contexts/note-model Section snapshots
  -> runtime ports only

apps/worker scheduler Agent-local SQL adapter
  -> runtime scheduler ports
  -> Agent-local temporary state

apps/worker scheduler note snapshot SQL adapter
  -> SchedulerNoteSnapshotPort
  -> Turso canonical sections
  -> optional Agent-local dirty section marks

contexts/context-assembly
  -> contexts/note-model
  -> contexts/memory

apps/worker context assembly runtime flow
  -> contexts/context-assembly contract
  -> ContextAssemblyTargetSnapshotPort
  -> ContextAssemblyLocalStructurePort
  -> ContextAssemblyRelatedContextRetrievalPort
  -> ContextAssemblyMemoryRetrievalPort

apps/worker context assembly target snapshot SQL adapter
  -> ContextAssemblyTargetSnapshotPort
  -> Turso canonical notes / sections / blocks

apps/worker context assembly local structure SQL adapter
  -> ContextAssemblyLocalStructurePort
  -> semantic_units / section summary / structure snapshot projections

apps/worker context assembly related context SQL adapter
  -> ContextAssemblyRelatedContextRetrievalPort
  -> semantic_unit_related_candidates / semantic_units projections
  -> Turso canonical note card / block excerpts

apps/worker context assembly memory context SQL adapter
  -> ContextAssemblyMemoryRetrievalPort
  -> memory_context_candidates projection
  -> Turso canonical memory_items scoped by workspace_id / user_id

contexts/ai-operations
  -> contexts/note-model
  -> contexts/memory

AI Engine
  -> provider registry
  -> operation generation provider
  -> structure job operation orchestration flow
  -> completed StructureJob response
  -> structure job operation flow
  -> runtime operation routing adapter
  -> Operation Router
  -> semantic unit / memory candidate / assist block projections

apps/worker
  -> contexts/ai-operations Operation Router contract
  -> structure job operation orchestration flow
  -> operation audit persistence flow
  -> operation audit persistence port
  -> schema-aware SQL adapter
  -> Turso operation audit executor
  -> operation audit recovery queue port
```

## 現在の実装状態

- Live contracts は `contexts/*/src/contract/*` に配置されています。
- Runtime operation routing adapter、structure job operation orchestration flow、operation audit persistence flow、audit persistence port、SQL/Turso mapping adapter、Turso operation audit executor、operation audit recovery queue port、scheduler runtime flow、scheduler Agent-local SQL adapter、scheduler note snapshot SQL adapter、context assembly runtime flow、context assembly target snapshot SQL adapter、context assembly local structure SQL adapter、context assembly related context SQL adapter、context assembly memory context SQL adapter は `apps/worker/src/*` にあります。
- UI/DB の実接続はまだ scaffold 段階です。
- Generated projections は `docs/generated/authority-graph.json` と `apps/workspace-api/generated/openapi.json` にあります。
- この記録は説明用の projection であり、判断が必要な場合は `docs/contracts/**` を参照します。
