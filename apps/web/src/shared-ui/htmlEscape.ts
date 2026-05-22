const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character);
}

export function escapeAttribute(value: string | number | boolean): string {
  return escapeHtml(String(value));
}
