export interface NoteTitleKeyInput {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

const imeProcessingKeyCode = 229;

export function shouldCommitNoteTitleKey(input: NoteTitleKeyInput): boolean {
  return input.key === 'Enter'
    && input.shiftKey !== true
    && input.isComposing !== true
    && input.keyCode !== imeProcessingKeyCode;
}

export function normalizeNoteTitleDraft(title: string, fallbackTitle: string): string {
  const normalized = title
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 0 ? normalized : fallbackTitle.trim();
}
