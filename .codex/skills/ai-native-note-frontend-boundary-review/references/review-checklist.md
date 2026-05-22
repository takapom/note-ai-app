# Frontend Boundary Review Checklist

Source of record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`.

## Backend-owned semantics

Flag code if frontend decides:

- AI operation safety.
- memory context eligibility.
- section boundaries.
- StructureJob scheduling.
- canonical mutation / promotion of AI output.
- whether AI output can directly mutate Note / Section / Block source of truth.

## Backend pollution

Flag backend API changes created only for UI display convenience, including:

- `cardColor`
- `isExpandedByDefault`
- `rightPanelSection`
- `componentVariant`
- `cssClassName`

Accept backend fields that represent product meaning, such as:

- `origin`
- `provenance`
- `operationPolicy`
- `status`
- `sourceSpan`
- `triggerReason`
- `proposalState`

## Dependency direction

Flag:

- `shared-ui` importing product modules.
- API client importing React or UI modules.
- feature components calling `fetch` directly.
- presenters calling APIs.
- `app/` owning product rules.
- API path literals scattered outside `runtime/api-client`.

## UI design

Flag:

- AI content indistinguishable from user-authored content.
- writing blocked by digest, memory, or AI surfaces.
- mobile layout hiding the note surface behind secondary AI UI.
- color-only AI/user distinction.
- missing focus, keyboard, pending, or error states.

## No invented state

Flag fabricated:

- operation IDs.
- memory IDs.
- provenance IDs.
- source span IDs.
- note or block IDs.
- fake digest items.
- fake provenance.
- fake related notes.
- fake memory candidates.

