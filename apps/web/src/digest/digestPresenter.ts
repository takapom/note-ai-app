import type {
  DigestItemInput,
  NextOpenDigestInput,
  NextOpenDigestSectionViewModel,
  NextOpenDigestViewModel,
} from '../note-surface/viewModelTypes.ts';

export function parseNextOpenDigestInput(body: unknown): NextOpenDigestInput | undefined {
  const candidate = unwrapDigestResultBody(body);
  if (!isPlainRecord(candidate) || typeof candidate.available !== 'boolean') {
    return undefined;
  }

  const arrays = copyValidatedDigestArrays(candidate);
  if (arrays.invalid) {
    return undefined;
  }

  return {
    available: candidate.available,
    loadState: 'provided',
    ...arrays.partial,
  };
}

function unwrapDigestResultBody(body: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(body)) {
    return undefined;
  }

  return isPlainRecord(body.result) ? body.result : body;
}

function copyValidatedDigestArrays(
  digest: Record<string, unknown>,
): { invalid: boolean; partial: Partial<NextOpenDigestInput> } {
  if (digest.available === false) {
    return { invalid: false, partial: {} };
  }

  const partial: Partial<NextOpenDigestInput> = {};
  const fieldNames = [
    'unresolvedQuestions',
    'decisions',
    'relatedNotes',
    'memoryCandidates',
  ] as const;

  for (const fieldName of fieldNames) {
    const copied = copyValidatedDigestArray(digest, fieldName);
    if (copied.invalid) {
      return { invalid: true, partial: {} };
    }

    Object.assign(partial, copied.partial);
  }

  return { invalid: false, partial };
}

function copyValidatedDigestArray(
  digest: Record<string, unknown>,
  fieldName: 'unresolvedQuestions' | 'decisions' | 'relatedNotes' | 'memoryCandidates',
): { invalid: boolean; partial: Partial<NextOpenDigestInput> } {
  const value = digest[fieldName];
  if (value === undefined) {
    return { invalid: false, partial: {} };
  }

  if (!Array.isArray(value)) {
    return { invalid: true, partial: {} };
  }

  const items: DigestItemInput[] = [];
  for (const entry of value) {
    if (!isDigestItemInput(entry)) {
      return { invalid: true, partial: {} };
    }

    items.push({
      id: entry.id,
      text: entry.text,
      ...(entry.sourceBlockId === undefined ? {} : { sourceBlockId: entry.sourceBlockId }),
      ...(entry.sourceNoteId === undefined ? {} : { sourceNoteId: entry.sourceNoteId }),
    });
  }

  return items.length === 0
    ? { invalid: false, partial: {} }
    : { invalid: false, partial: { [fieldName]: items } };
}

function isDigestItemInput(value: unknown): value is DigestItemInput {
  return isPlainRecord(value) && typeof value.id === 'string' && typeof value.text === 'string';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function resolveDigestEmptyState(
  digest: NextOpenDigestInput | undefined,
): NextOpenDigestViewModel['emptyState'] {
  if (digest?.loadState === 'transport_failed') {
    return 'load_failed';
  }

  if (digest?.loadState === 'invalid_body') {
    return 'invalid_body';
  }

  return 'unavailable';
}

export function createNextOpenDigestViewModel(
  digest: NextOpenDigestInput | undefined,
  expanded: boolean,
): NextOpenDigestViewModel {
  if (digest?.available !== true) {
    return {
      kind: 'NextOpenDigest',
      available: false,
      compact: true,
      expandable: true,
      expanded: false,
      sections: [],
      emptyState: resolveDigestEmptyState(digest),
      ...(digest?.loadState === undefined ? {} : { loadState: digest.loadState }),
      emitsAiProviderCall: false,
    };
  }

  const sections = [
    createDigestSection('unresolved_questions', 'Unresolved questions', digest.unresolvedQuestions),
    createDigestSection('decisions', 'Decisions', digest.decisions),
    createDigestSection('related_notes', 'Related notes', digest.relatedNotes),
    createDigestSection('memory_candidates', 'Memory candidates', digest.memoryCandidates),
  ].filter((section): section is NextOpenDigestSectionViewModel => section.items.length > 0);

  return {
    kind: 'NextOpenDigest',
    available: true,
    compact: true,
    expandable: true,
    expanded,
    sections,
    emptyState: sections.length === 0 ? 'no_items' : 'has_items',
    loadState: digest.loadState ?? 'provided',
    emitsAiProviderCall: false,
  };
}

function createDigestSection(
  id: NextOpenDigestSectionViewModel['id'],
  label: NextOpenDigestSectionViewModel['label'],
  items: readonly DigestItemInput[] | undefined,
): NextOpenDigestSectionViewModel {
  return {
    id,
    label,
    items: (items ?? []).map((item) => ({
      id: item.id,
      text: item.text,
      ...(item.sourceBlockId === undefined && item.sourceNoteId === undefined
        ? {}
        : {
            source: {
              ...(item.sourceBlockId === undefined ? {} : { blockId: item.sourceBlockId }),
              ...(item.sourceNoteId === undefined ? {} : { noteId: item.sourceNoteId }),
            },
          }),
    })),
  };
}
