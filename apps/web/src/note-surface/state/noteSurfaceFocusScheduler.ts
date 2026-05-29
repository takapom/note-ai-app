export interface NoteSurfaceFocusTarget {
  focus(): void;
}

export interface NoteSurfaceFocusDocument {
  querySelector(selector: string): NoteSurfaceFocusTarget | null;
}

export interface NoteSurfaceFocusSchedulerEnvironment {
  document?: NoteSurfaceFocusDocument;
  setTimeout(callback: () => void, delay: number): unknown;
}

export function focusEditableBlockSoon(
  blockId: string | undefined,
  environment: NoteSurfaceFocusSchedulerEnvironment = createGlobalFocusEnvironment(),
): void {
  if (blockId === undefined) {
    return;
  }

  environment.setTimeout(() => {
    const target = environment.document?.querySelector(`[data-block-id="${blockId}"] [data-block-editor-content="true"]`);
    target?.focus();
  }, 80);
}

function createGlobalFocusEnvironment(): NoteSurfaceFocusSchedulerEnvironment {
  return {
    document: globalThis.document,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
}
