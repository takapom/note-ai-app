# State And API Checklist

Source of record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`.

## Initial API functions

- `getNote(noteId)`
- `createNote(input)`
- `updateNote(noteId, input)`
- `createBlock(noteId, input)`
- `patchBlock(blockId, input)`
- `deleteBlock(blockId)`
- `leaveNote(noteId, cause)`
- `manualStructure(noteId)`
- `getDigest(noteId)`
- `lookupProvenanceSource(input)`
- `acceptOperation(operationId)`
- `dismissOperation(operationId)`
- `acceptMemory(memoryId)`
- `rejectMemory(memoryId)`
- `editMemory(memoryId, input)`
- `holdMemory(memoryId)`
- `deleteMemory(memoryId)`

## Stable frontend API errors

Use stable meanings such as:

```ts
type ApiError =
  | { kind: "unauthorized" }
  | { kind: "not-found" }
  | { kind: "method-not-allowed" }
  | { kind: "not-configured" }
  | { kind: "backend-failed"; message: string };
```

Do not expose transport, framework, or provider details directly to components unless a contract makes them product-visible.

## Presenter rules

Presenter may:

- choose visual grouping.
- derive display labels.
- map backend `origin`, `type`, `status`, and `provenance` into UI view-model variants.
- provide display-safe defaults for missing optional fields.

Presenter must not:

- call APIs.
- mutate canonical state.
- decide product eligibility.
- reinterpret backend policy.

## State honesty

- Missing backend values stay missing or unavailable in the UI.
- Pending and failed actions remain visible near the affected action.
- Local optimistic UI must not imply canonical mutation unless the backend response confirms it.

