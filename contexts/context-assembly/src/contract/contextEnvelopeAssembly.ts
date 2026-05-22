// Live product semantics for AI Context Envelope.
// Authority: docs/contracts/context-assembly.md


import { resolveDescriptionEffective } from '../../../note-model/src/contract/noteContract.ts';
import { isContextEligibleMemory } from '../../../memory/src/contract/memoryContract.ts';
import {
  defaultContextAssemblyLimits,
  relatedContextRetrievalOrder,
  untrustedAiProjectionContent,
  untrustedMemoryProjectionContent,
  untrustedUserContent,
  type ContextAssemblyInput,
  type ContextAssemblyLimits,
  type ContextContentOrigin,
  type ContextEnvelopeContract,
  type EnvelopeMemoryStatus,
  type MemoryContextItemInput,
  type RelatedContextRetrievalReason,
  type UntrustedContentBoundaryContract,
} from './contextEnvelopeTypes.ts';
import { asRecord, isContextContentOrigin } from './contextEnvelopePrimitives.ts';
import { normalizeContextAssemblyLimits } from './contextEnvelopeValidation.ts';

export function assembleContextEnvelope(input: ContextAssemblyInput, limits: ContextAssemblyLimits = defaultContextAssemblyLimits): ContextEnvelopeContract {
  const normalizedLimits = normalizeContextAssemblyLimits(limits);
  const outline = input.outline.map((item) => ({ ...item }));
  const descriptionEffective = resolveDescriptionEffective(input.note, outline);

  return {
    target: {
      scope: input.target.scope,
      text: input.target.text,
      sourceBlockIds: input.target.sourceBlockIds.slice(0, normalizedLimits.maxTargetSourceBlockIds),
      contentBoundary: untrustedUserContent,
    },
    note: {
      id: input.note.id,
      title: input.note.title,
      descriptionEffective,
      outline,
      contentBoundary: untrustedUserContent,
    },
    localStructure: {
      existingSemanticUnits: (input.localStructure?.existingSemanticUnits ?? [])
        .slice(0, normalizedLimits.maxExistingSemanticUnits)
        .map((unit) => withContentBoundary(unit, untrustedAiProjectionContent)),
      sectionSummaries: (input.localStructure?.sectionSummaries ?? [])
        .slice(0, normalizedLimits.maxSectionSummaries)
        .map((summary) => withContentBoundary(summary, untrustedAiProjectionContent)),
      ...(input.localStructure?.previousStructureSnapshot
        ? {
            previousStructureSnapshot: withContentBoundary(
              input.localStructure.previousStructureSnapshot,
              untrustedAiProjectionContent,
            ),
          }
        : {}),
    },
    relatedContext: {
      semanticUnits: sortByRetrievalPriority(input.relatedContext?.semanticUnits ?? [])
        .slice(0, normalizedLimits.maxRelatedSemanticUnits)
        .map((unit) => withContentBoundary(unit, untrustedAiProjectionContent)),
      notes: sortByRetrievalPriority(input.relatedContext?.notes ?? [])
        .slice(0, normalizedLimits.maxRelatedNotes)
        .map((note) => withContentBoundary(note, untrustedUserContent)),
      sourceBlockExcerpts: (input.relatedContext?.sourceBlockExcerpts ?? [])
        .slice(0, normalizedLimits.maxSourceBlockExcerpts)
        .map((excerpt) => withContentBoundary(excerpt, untrustedUserContent)),
    },
    memoryContext: {
      items: sortMemoryItems(input.memoryContext?.items ?? [])
        .filter(isEnvelopeMemoryInput)
        .slice(0, normalizedLimits.maxActiveMemoryItems)
        .map((memory) => withContentBoundary(
          {
            ...memory,
            status: memory.status,
          },
          untrustedMemoryProjectionContent,
        )),
    },
    constraints: {
      returnOperationsOnly: true,
      doNotRewriteUserText: true,
      requireSourceSpans: true,
      requireConfidence: true,
    },
    trustBoundary: {
      userContentIsUntrusted: true,
      externalContentIsUntrusted: true,
      memoryContentIsUntrusted: true,
      contentMustNotOverrideSystemInstructions: true,
    },
  };
}

function withContentBoundary<T extends object>(
  value: T,
  fallbackBoundary: UntrustedContentBoundaryContract,
): T & { contentBoundary: UntrustedContentBoundaryContract } {
  return {
    ...value,
    contentBoundary: sanitizeContentBoundary(
      'contentBoundary' in value ? (value as { contentBoundary?: unknown }).contentBoundary : undefined,
      fallbackBoundary,
    ),
  };
}

function sanitizeContentBoundary(
  value: unknown,
  fallbackBoundary: UntrustedContentBoundaryContract,
): UntrustedContentBoundaryContract {
  const boundary = asRecord(value);
  if (
    boundary &&
    boundary.trust === 'untrusted' &&
    boundary.treatAsInstruction === false &&
    isContextContentOrigin(boundary.origin)
  ) {
    return {
      trust: 'untrusted',
      origin: boundary.origin,
      treatAsInstruction: false,
    };
  }

  return fallbackBoundary;
}

function sortByRetrievalPriority<T extends { retrievalReason?: RelatedContextRetrievalReason; relevanceScore?: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftPriority = retrievalPriority(left.retrievalReason);
    const rightPriority = retrievalPriority(right.retrievalReason);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
  });
}

function retrievalPriority(reason: RelatedContextRetrievalReason | undefined): number {
  if (!reason) {
    return relatedContextRetrievalOrder.length;
  }
  return relatedContextRetrievalOrder.indexOf(reason);
}

function sortMemoryItems(items: readonly MemoryContextItemInput[]): MemoryContextItemInput[] {
  return [...items].sort((left, right) => {
    const pinnedRank = Number(right.status === 'pinned' || right.pinned) - Number(left.status === 'pinned' || left.pinned);
    if (pinnedRank !== 0) {
      return pinnedRank;
    }

    const relevanceRank = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
    if (relevanceRank !== 0) {
      return relevanceRank;
    }

    return right.updatedAt - left.updatedAt;
  });
}

function isEnvelopeMemoryInput(memory: MemoryContextItemInput): memory is MemoryContextItemInput & { status: EnvelopeMemoryStatus } {
  return isContextEligibleMemory(memory);
}
