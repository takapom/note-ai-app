# State And API Checklist

参照元 record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

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

次のような stable meaning を使う:

```ts
type ApiError =
  | { kind: "unauthorized" }
  | { kind: "not-found" }
  | { kind: "method-not-allowed" }
  | { kind: "not-configured" }
  | { kind: "backend-failed"; message: string };
```

contract が product-visible として定義していない限り、transport / framework / provider detail を component に直接漏らさない。

## Presenter rules

Presenter がしてよいこと:

- visual grouping を選ぶ。
- display label を導出する。
- map backend `origin`, `type`, `status`, and `provenance` into UI view-model variants.
- missing optional field に display-safe default を与える。

Presenter がしてはいけないこと:

- API を呼ぶ。
- canonical state を mutate する。
- product eligibility を判断する。
- backend policy を reinterpret する。

## State honesty

- missing backend value は UI でも missing / unavailable のまま扱う。
- pending / failed action は affected action の近くに表示し続ける。
- backend response が確認するまで、local optimistic UI が canonical mutation を意味してはいけない。
