import { provenanceExcerptMaxChars } from '../note-surface/viewModelConstants.ts';
import type {
  ProvenancePopoverInput,
  ProvenancePopoverViewModel,
} from '../note-surface/viewModelTypes.ts';

export function createProvenancePopoverViewModel(
  provenance: ProvenancePopoverInput | undefined,
): ProvenancePopoverViewModel {
  if (provenance?.open !== true) {
    return {
      kind: 'ProvenancePopover',
      open: false,
      excerptMaxChars: provenanceExcerptMaxChars,
      includesFullNote: false,
      includesFullWorkspace: false,
      emitsAiProviderCall: false,
    };
  }

  const source = createProvenanceSource(provenance);

  return {
    kind: 'ProvenancePopover',
    open: true,
    ...(provenance.excerpt === undefined ? {} : { boundedExcerpt: boundExcerpt(provenance.excerpt) }),
    excerptMaxChars: provenanceExcerptMaxChars,
    ...(source === undefined ? {} : { source }),
    ...(provenance.reason === undefined ? {} : { reason: provenance.reason }),
    includesFullNote: false,
    includesFullWorkspace: false,
    emitsAiProviderCall: false,
  };
}

function createProvenanceSource(
  provenance: ProvenancePopoverInput,
): ProvenancePopoverViewModel['source'] {
  const source = {
    ...(provenance.sourceBlockId === undefined ? {} : { blockId: provenance.sourceBlockId }),
    ...(provenance.sourceNoteId === undefined ? {} : { noteId: provenance.sourceNoteId }),
    ...(provenance.sourceUnitId === undefined ? {} : { unitId: provenance.sourceUnitId }),
    ...(provenance.sourceTitle === undefined ? {} : { title: provenance.sourceTitle }),
    ...(provenance.startOffset === undefined ? {} : { startOffset: provenance.startOffset }),
    ...(provenance.endOffset === undefined ? {} : { endOffset: provenance.endOffset }),
  };

  return Object.keys(source).length === 0 ? undefined : source;
}

function boundExcerpt(excerpt: string): string {
  if (excerpt.length <= provenanceExcerptMaxChars) {
    return excerpt;
  }

  return excerpt.slice(0, provenanceExcerptMaxChars);
}
