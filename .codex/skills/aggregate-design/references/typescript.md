# Aggregate 設計パターン - TypeScript

`../_shared/ai-native-note-bounded-contexts.md` を読んだ後にだけ、これらの例を使う。
このリポジトリでは、`docs/contracts/**` の contracts が policy を定義し、`contexts/*/src/contract/*` が live semantics を定義する。

## 不変 Aggregate の形

private props object と copy-on-write update を優先する。invalid aggregate instance が存在できないように、constructor または smart constructor 内で validate する。

```typescript
type NoteDocumentProps = {
  readonly note: NoteContract;
  readonly sections: readonly SectionContract[];
  readonly blocks: readonly BlockContract[];
};

class NoteDocument {
  private constructor(private readonly props: NoteDocumentProps) {
    if (!props.note.id.trim() || !props.note.workspaceId.trim()) {
      throw new Error('note identity is required');
    }
    if (!props.blocks.every((block) => block.noteId === props.note.id)) {
      throw new Error('blocks must belong to the note document');
    }
    if (!props.sections.every((section) => section.noteId === props.note.id)) {
      throw new Error('sections must belong to the note document');
    }
  }

  static reconstruct(props: NoteDocumentProps): NoteDocument {
    return new NoteDocument({
      ...props,
      sections: [...props.sections],
      blocks: [...props.blocks],
    });
  }

  markSectionDirty(sectionId: string, contentHash: string, now: number): NoteDocument {
    return new NoteDocument({
      ...this.props,
      sections: this.props.sections.map((section) =>
        section.id === sectionId
          ? { ...section, contentHash, isDirty: true, updatedAt: now }
          : section,
      ),
    });
  }

  get note(): NoteContract {
    return this.props.note;
  }

  get sections(): readonly SectionContract[] {
    return this.props.sections;
  }

  get blocks(): readonly BlockContract[] {
    return this.props.blocks;
  }
}
```

## 境界をまたぐ ID 参照

他の aggregate root は object graph の外に置く。保存するのは ID または snapshot のみにする。

```typescript
type StructureJobProps = {
  readonly id: string;
  readonly workspaceId: string;
  readonly noteId: string;
  readonly sectionId?: string;
  readonly contextHash: string;
  readonly status: StructureJobStatus;
};

// 良い例: job は note/section の identity を参照する。
class StructureJob {
  private constructor(private readonly props: StructureJobProps) {}
}

// 悪い例: job が mutable な note state を埋め込み、note semantics を所有し始める。
type InvalidJobProps = {
  readonly id: string;
  readonly noteDocument: NoteDocument;
};
```

## Context Envelope 境界

`ContextEnvelope` は input minimization、budget、K limits、untrusted content marker を所有する。operation routing や provider policy を所有してはいけない。

```typescript
type ContextEnvelopeProps = {
  readonly target: TargetScopeContract;
  readonly note: NoteCardContract;
  readonly localStructure: LocalStructureContextContract;
  readonly relatedContext: RelatedContextContract;
  readonly memoryContext: MemoryContextContract;
  readonly constraints: ContextEnvelopeConstraintsContract;
  readonly trustBoundary: ContextEnvelopeTrustBoundaryContract;
};

class ContextEnvelope {
  private constructor(private readonly props: ContextEnvelopeProps) {
    if (props.target.sourceBlockIds.length === 0) {
      throw new Error('target source block ids are required');
    }
    if (props.memoryContext.items.some((item) => item.status !== 'active' && item.status !== 'pinned')) {
      throw new Error('only active or pinned memory may enter the envelope');
    }
    if (!props.constraints.returnOperationsOnly || !props.constraints.requireSourceSpans) {
      throw new Error('AI responses must be constrained to sourced operations');
    }
  }

  static create(props: ContextEnvelopeProps): ContextEnvelope {
    return new ContextEnvelope(props);
  }
}
```

## Operation Router 結果の境界

router は validation、policy、confidence、target check から `ApplyDecision` と audit record を作る。raw AI output に note blocks を mutate させてはいけない。

```typescript
type ApplyDecisionProps = {
  readonly operationId: string;
  readonly action: 'apply' | 'propose' | 'no_apply' | 'reject';
  readonly reason: string;
  readonly auditRecord: AiOperationAuditRecordContract;
};

class ApplyDecision {
  private constructor(private readonly props: ApplyDecisionProps) {
    if (!props.operationId.trim()) {
      throw new Error('operation id is required');
    }
    if (props.action === 'apply' && props.auditRecord.policy === 'blocked') {
      throw new Error('blocked operations cannot be applied');
    }
  }

  static reject(operationId: string, reason: string, auditRecord: AiOperationAuditRecordContract): ApplyDecision {
    return new ApplyDecision({ operationId, reason, auditRecord, action: 'reject' });
  }
}
```

## レビューチェック

- constructor または factory が empty ID、invalid timestamp、missing source span、不可能な status transition、sentinel value を拒否する。
- 他 context は ID、bounded snapshot、明示的な contract input として表現する。
- collection は readonly value または defensive copy として返す。
- update は spread syntax で無関係な props を保ち、invariant check を再実行する。
- tests は invalid な `NoteDocument`、`StructureJob`、`ContextEnvelope`、`MemoryItem`、`StructureOperation`、`AuditRecord`、`ApplyDecision` input が valid domain object になれないことを証明する。
