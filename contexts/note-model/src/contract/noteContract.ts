// Live product semantics for the app-specific Note / Section / Block model.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md
// Facade evidence markers:
// Block origins: 'user', 'ai', 'user_modified_ai', 'system'.
// Block types: 'paragraph', 'heading', 'bullet_list_item', 'numbered_list_item',
// 'todo', 'quote', 'code', 'divider', 'ai_summary', 'ai_question',
// 'ai_decision', 'ai_related_context', 'ai_memory_candidate'.

export * from './noteTypes.ts';
export * from './noteValidation.ts';
