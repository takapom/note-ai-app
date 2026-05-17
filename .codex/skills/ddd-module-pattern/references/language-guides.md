# AI Native Note module の言語ガイド

task が package、directory、file layout を求める場合だけこの reference を使う。owner contract は `docs/contracts/**` に、live semantics は `contexts/*/src/contract/*` に置く。

## Repository の基準

```text
contexts/
  note-model/
    src/contract/
      noteContract.ts
  scheduler/
    src/contract/
      structureSchedulerContract.ts
  context-assembly/
    src/contract/
      contextEnvelopeContract.ts
  memory/
    src/contract/
      memoryContract.ts
  ai-operations/
    src/contract/
      operationContract.ts
      operationRouterContract.ts
  topology/
    src/contract/
      topologyContract.ts
```

ルール:

- module は technical category ではなく bounded context language で名付ける。
- Note、Scheduler、Context Assembly、Memory、AI Operations、Operation Router の invariant を所有する shared package を作らない。
- adapter は runtime または app boundary の背後に置く。
- generated docs、issue text、prompts、Superset tasks は projection または evidence である。

## TypeScript

```text
contexts/
  note-model/
    src/
      contract/
        noteContract.ts
        noteFixtures.ts
      domain/
        noteDocument.ts
        sectionBoundary.ts
  scheduler/
    src/
      contract/
        structureSchedulerContract.ts
      domain/
        structureJob.ts
  context-assembly/
    src/
      contract/
        contextEnvelopeContract.ts
      domain/
        contextEnvelope.ts
  ai-operations/
    src/
      contract/
        operationContract.ts
        operationRouterContract.ts
      domain/
        applyDecision.ts
```

指針:

- stable live-contract API は `src/contract` から export する。
- implementation は `shared/types` ではなく owning context の背後に置く。
- 他 context からの import は、許可された topology edge に沿う場合だけ使う。
- UI rendering は `apps/web` に置く。provider、worker、Turso access は runtime/app adapter に置く。

## Python

contract が Python implementation を明示的に導入しない限り、Python は script、evaluation harness、migration helper、analysis tooling にだけ使う。

```text
scripts/
  verify_contracts/
    note_model.py
    scheduler.py
    context_envelope.py
```

指針:

- Python script は contract を input として読む。second source of policy になってはいけない。
- generated output は source-of-truth contract の横ではなく、generated/evidence path に置く。

## Rust

verification または runtime support のために Rust crate を導入する場合は、context 名を mirror する。

```text
crates/
  note_model/
    src/lib.rs
    src/note_document.rs
  scheduler/
    src/lib.rs
    src/structure_job.rs
  operation_router/
    src/lib.rs
    src/apply_decision.rs
```

指針:

- 1 つの crate が複数 bounded context の invariant を黙って集めてはいけない。
- cross-context input には明示的な API type を使う。

## Scala

Scala を analysis または typed modeling に使う場合は、package を context-first にする。

```text
aiNativeNote/
  noteModel/
    NoteDocument.scala
    SectionBoundary.scala
  scheduler/
    StructureJob.scala
  contextAssembly/
    ContextEnvelope.scala
  aiOperations/
    StructureOperation.scala
    ApplyDecision.scala
```

指針:

- package 名は bounded context term を反映する。
- integration implementation は domain package の外に置く。

## Go

```text
internal/
  note_model/
    note_document.go
    section_boundary.go
  scheduler/
    structure_job.go
  operation_router/
    apply_decision.go
```

指針:

- interface はそれを consume する boundary に置く。
- 1 つの context に属する ids、statuses、policies のために広い `common` package を作らない。

## C Sharp

```text
Contexts/
  NoteModel/
    NoteDocument.cs
    SectionBoundary.cs
  Scheduler/
    StructureJob.cs
  ContextAssembly/
    ContextEnvelope.cs
  AiOperations/
    StructureOperation.cs
    ApplyDecision.cs
```

指針:

- bounded context ごとに namespace を切る。
- record は value object と immutable snapshot に適している。
- infrastructure implementation は context domain namespace の外に置く。
