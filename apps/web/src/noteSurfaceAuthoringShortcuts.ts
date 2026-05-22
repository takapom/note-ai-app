export type AuthoringShortcutIntent = 'heading' | 'quote' | 'bullet';

export interface AuthoringShortcutResult {
  content: string;
  intent?: AuthoringShortcutIntent;
  headingLevel?: 1 | 2 | 3;
}

const headingPattern = /^(#{1,3})\s+(.+)$/s;
const quotePattern = /^>\s?(.+)$/s;
const bulletPattern = /^[-*]\s+(.+)$/s;

export function applyAuthoringShortcutToBlockContent(rawContent: string): AuthoringShortcutResult {
  const content = rawContent.replace(/\r\n/g, '\n');
  const firstLine = content.split('\n')[0] ?? '';
  const headingMatch = headingPattern.exec(firstLine.trim());
  if (headingMatch !== null) {
    const level = headingMatch[1].length as 1 | 2 | 3;
    const title = headingMatch[2].trim();
    const remainder = content.slice(firstLine.length).replace(/^\n+/, '');
    const normalized = remainder.length > 0 ? `${title}\n${remainder}` : title;
    return {
      content: normalized,
      intent: 'heading',
      headingLevel: level,
    };
  }

  const quoteMatch = quotePattern.exec(firstLine.trim());
  if (quoteMatch !== null) {
    const body = quoteMatch[1].trim();
    const remainder = content.slice(firstLine.length).replace(/^\n+/, '');
    const normalized = remainder.length > 0 ? `${body}\n${remainder}` : body;
    return {
      content: normalized,
      intent: 'quote',
    };
  }

  const bulletMatch = bulletPattern.exec(firstLine.trim());
  if (bulletMatch !== null) {
    const body = bulletMatch[1].trim();
    const remainder = content.slice(firstLine.length).replace(/^\n+/, '');
    const normalized = remainder.length > 0 ? `${body}\n${remainder}` : body;
    return {
      content: normalized,
      intent: 'bullet',
    };
  }

  return { content };
}
