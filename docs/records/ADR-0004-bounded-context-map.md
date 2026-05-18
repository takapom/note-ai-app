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
  -> Scheduler handles BlockChanged
  -> dirty section marked
  -> no AI call

Note close / tab switch / app leave / manual organize
  -> Scheduler plans StructureJob
  -> Context Assembly builds bounded ContextEnvelope
  -> AI returns operation list
  -> Runtime gates on completed StructureJob response
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

contexts/context-assembly
  -> contexts/note-model
  -> contexts/memory

contexts/ai-operations
  -> contexts/note-model
  -> contexts/memory

AI Engine
  -> Operation Router
  -> semantic unit / memory candidate / assist block projections

apps/worker
  -> contexts/ai-operations Operation Router contract
  -> operation audit persistence port
  -> schema-aware SQL adapter
  -> Turso operation audit executor
  -> operation audit recovery queue port
```

## 現在の実装状態

- Live contracts は `contexts/*/src/contract/*` に配置されています。
- Runtime operation routing adapter、audit persistence port、SQL/Turso mapping adapter、Turso operation audit executor、operation audit recovery queue port は `apps/worker/src/*` にあります。
- UI/DB の実接続はまだ scaffold 段階です。
- Generated projections は `docs/generated/authority-graph.json` と `apps/workspace-api/generated/openapi.json` にあります。
- この記録は説明用の projection であり、判断が必要な場合は `docs/contracts/**` を参照します。
