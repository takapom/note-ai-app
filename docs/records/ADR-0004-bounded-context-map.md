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
  -> Operation Router validates and classifies operations
  -> runtime boundary applies/proposes/rejects projections and audit records
```

## Dependency Shape

```text
docs/contracts/**
  -> contexts/*/src/contract/*

apps/web
  -> contexts/*/src/contract/*
  -> apps/worker API
  -> Cloudflare Agents
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
```

## 現在の実装状態

- Live contracts は `contexts/*/src/contract/*` に配置されています。
- Runtime/UI/DB 実装はまだ scaffold 段階です。
- Generated projections は `docs/generated/authority-graph.json` と `apps/workspace-api/generated/openapi.json` にあります。
- この記録は説明用の projection であり、判断が必要な場合は `docs/contracts/**` を参照します。
