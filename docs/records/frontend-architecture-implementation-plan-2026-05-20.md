# Frontend architecture implementation plan

ドキュメント種別: record
作成日: 2026-05-20
目的: backend architecture refactor 後の責務境界に合わせ、AI Native Note MVP frontend を実装するための構造・依存方向・最初の実装 slice を記録する。
関連契約: `docs/contracts/frontend-ui.md`, `docs/contracts/unified-note-surface.md`, `docs/contracts/app-note-model.md`, `docs/contracts/api-events.md`, `docs/contracts/operation-return-contract.md`, `docs/contracts/memory.md`, `docs/contracts/repository-topology.md`, `docs/contracts/verification-lanes.md`
関連 app-local contract: `apps/web/docs/ui-surface-contract.md`
関連 record: `docs/records/backend-architecture-refactor-plan-2026-05-20.md`, `docs/records/frontend-ui-visual-direction-2026-05-21.md`

## Summary

Frontend は backend の product semantics を再実装しない。Frontend の責務は、backend-owned state を表示し、user intent を backend command に変換し、loading / error / draft / focus などの ephemeral UI state を扱うことに限定する。

中心思想:

- backend = product semantics、state transition、AI operation policy、persistence の owner。
- frontend = backend state の presenter、user input、user intent command mapping、ephemeral UI state の owner。
- frontend module は backend bounded context を mirror するが、domain rule は再実装しない。
- UI 都合の変更は presenter / UI module に閉じ、backend API / contracts を汚染しない。

この record は active policy ではない。実装前に `docs/contracts/**` と `apps/web/docs/ui-surface-contract.md` を確認し、矛盾があれば contracts を優先する。

## Non-Goals

- Frontend に AI operation safety 判断、memory eligibility 判断、section boundary 計算、StructureJob planning、AI-generated content の canonical mutation 判断を持たせない。
- Backend API を React component props や layout convenience に合わせて変更しない。
- `shared-ui` に product/domain vocabulary を入れない。
- 初期 slice で永続 AI chat、AI mode-toggle UX、外部連携、Markdown-as-canonical-state を作らない。Markdown-compatible authoring shortcuts は入力体験として許可するが、内部 SoT は Block / Section model のままにする。

## Target Frontend Topology

想定 path:

```text
apps/web/src
├─ app/
│  ├─ layout.tsx
│  └─ notes/[noteId]/page.tsx
├─ runtime/
│  ├─ api-client/
│  │  ├─ noteApi.ts
│  │  ├─ blockApi.ts
│  │  ├─ digestApi.ts
│  │  ├─ operationApi.ts
│  │  ├─ memoryApi.ts
│  │  └─ provenanceApi.ts
│  └─ server-state/
│     └─ queryKeys.ts
├─ note-surface/
│  ├─ ui/
│  ├─ presenter/
│  ├─ interaction/
│  └─ index.ts
├─ digest/
│  ├─ ui/
│  ├─ presenter/
│  └─ index.ts
├─ ai-assist/
│  ├─ ui/
│  ├─ presenter/
│  └─ index.ts
├─ memory/
│  ├─ ui/
│  ├─ presenter/
│  └─ index.ts
└─ shared-ui/
   ├─ button/
   ├─ panel/
   ├─ toolbar/
   └─ icon-button/
```

### Module Responsibilities

| Module | Owns | Must not own |
| --- | --- | --- |
| `app/` | routing, page-level composition, route params | product rule, API path literals beyond composition |
| `runtime/api-client` | HTTP method/path, request/response parsing, stable API error mapping | React state, layout, product policy |
| `runtime/server-state` | query keys and cache naming, if a server-state library is introduced | backend state transition decisions |
| `note-surface` | note display, section/block rendering, editable draft state, leave trigger interaction | section boundary calculation, AI routing, memory eligibility |
| `digest` | next-open digest display and item interaction | digest generation or recovery job decisions |
| `ai-assist` | AI assist / operation projection display, source inspection, edit/delete user intent | operation safety, direct-apply policy |
| `memory` | memory candidate display, source/provenance UI, accept/reject/edit/hold/delete user intent | hidden profiling, memory context eligibility |
| `shared-ui` | visual primitives only | Note, Block, Memory, Operation, Digest semantics |

## Allowed Dependency Direction

```text
app
  → note-surface / digest / ai-assist / memory
  → runtime/api-client only through module composition when needed

note-surface / digest / ai-assist / memory
  → runtime/api-client
  → shared-ui

presenter
  → backend DTO types or local frontend view-model types
  → no API calls
  → no React hooks required

interaction
  → api-client command functions
  → module-local UI state helpers

runtime/api-client
  → fetch / transport primitives
  → no React
  → no UI module

shared-ui
  → no product module
```

Forbidden examples:

- `shared-ui -> note-surface`
- `shared-ui -> memory`
- `runtime/api-client -> React`
- `runtime/api-client -> note-surface/ui`
- component-level direct `fetch('/notes/...')`
- `note-surface -> memory/internal`
- `memory -> ai-assist/internal`
- backend API response shaped by React component props

## Backend-Owned Semantics Boundary

Frontend may hold:

- display state
- focus / selection / hover / panel open state
- text draft state before save
- pending request state
- inline error state
- user intent mapping to backend command

Frontend must not decide:

- whether AI operation is safe
- whether memory candidate is context eligible
- whether a block is canonical user-authored content after AI generation
- whether a StructureJob should be scheduled
- whether an AI output can directly mutate Note / Section / Block SoT
- section boundary semantics

## Presenter Boundary

Backend DTOs should not be rendered directly by complex components. Each feature module should convert backend DTOs into view models through a presenter.

Example direction:

```text
backend DTO
  → presenter
  → view model
  → UI component
```

Presenter may:

- choose visual grouping.
- derive display labels.
- map backend `origin`, `type`, `status`, `provenance` into UI-specific view-model variants.
- hide missing optional fields behind display-safe defaults.

Presenter must not:

- call APIs.
- change canonical state.
- decide product eligibility.
- reinterpret backend policy.

Example view-model distinction:

```ts
type NoteBlockViewModel =
  | { kind: "editable-user-block"; id: string; text: string }
  | { kind: "readonly-ai-assist"; id: string; text: string; provenanceLabel?: string };
```

The distinction is display-only. The backend remains the owner of canonical block semantics and AI operation policy.

## API Client Boundary

Initial API client public surface:

```text
getNote(noteId)
createNote(input)
updateNote(noteId, input)
createBlock(noteId, input)
patchBlock(blockId, input)
deleteBlock(blockId)
leaveNote(noteId, cause)
manualStructure(noteId)
getDigest(noteId)
lookupProvenanceSource(input)
editAssistBlock(blockId, input)
deleteAssistBlock(blockId)
acceptMemory(memoryId)
rejectMemory(memoryId)
editMemory(memoryId, input)
holdMemory(memoryId)
deleteMemory(memoryId)
```

API client may map HTTP/transport failures into stable frontend error meanings:

```ts
type ApiError =
  | { kind: "unauthorized" }
  | { kind: "not-found" }
  | { kind: "method-not-allowed" }
  | { kind: "not-configured" }
  | { kind: "backend-failed"; message: string };
```

API client must not contain:

- component state.
- UI layout decisions.
- domain eligibility rules.
- retries that change product semantics.

## State Ownership

Frontend state is limited to two categories.

### Server State

Backend-owned data loaded through API:

- note document.
- sections.
- blocks.
- digest.
- operation proposals.
- memory candidate / memory review state.
- provenance lookup results.

Server state is cacheable but not canonical in the frontend.

### Ephemeral UI State

Frontend-owned temporary state:

- draft text.
- currently focused block.
- text selection.
- pending save state.
- inline error state.
- side panel open/closed state.
- expanded/collapsed digest item state.

Block editing rule:

```text
backend block.plainText = canonical
textarea draft = ephemeral
PATCH success = refresh server state or patch cache from backend response
PATCH failure = draft remains dirty and user-authored canonical block is not assumed changed
```

## Backend Pollution Guardrails

Backend API must not be changed for frontend-only display convenience.

Do not add backend fields such as:

```text
cardColor
isExpandedByDefault
rightPanelSection
componentVariant
cssClassName
```

Backend may expose product semantic fields such as:

```text
origin
provenance
operationPolicy
status
sourceSpan
triggerReason
proposalState
```

Rule of thumb:

- frontend-only sort/group/filter belongs in frontend presenter.
- product semantic sort/group/filter belongs in backend contract.
- if a UI need seems to require backend change, first ask whether the field is product meaning or presentation detail.

## First Implementation Slice

The first frontend slice should pass the core MVP loop without implementing every UI.

Scope:

1. Read frontend contracts:
   - `docs/contracts/frontend-ui.md`
   - `docs/contracts/unified-note-surface.md`
   - `docs/contracts/api-events.md`
   - `apps/web/docs/ui-surface-contract.md`
2. Create `runtime/api-client` with thin functions for note, block, digest, operation, memory, provenance routes.
3. Create note DTO to view-model presenter.
4. Render read-only note surface.
5. Add editable paragraph draft.
6. Wire block update to `PATCH /blocks/:blockId`.
7. Wire leave trigger to `POST /notes/:noteId/leave`.
8. Render `GET /notes/:noteId/digest`.
9. Add minimal inline AI Assist display with source/edit/delete controls.
10. Add minimal memory candidate actions.

Definition of Done for first slice:

- note loads through API client.
- user-authored block renders as editable.
- AI-origin block renders as visually distinct and not treated as user-authored SoT.
- block edit sends `PATCH /blocks/:blockId`.
- leaving note sends `POST /notes/:noteId/leave`.
- digest loads and renders without taking over the writing surface.
- AI Assist source/edit/delete actions do not mutate user-authored blocks directly.
- memory action calls correct endpoint.

## Design Direction

Visual direction、配色、必要情報量、surface ごとの表示項目は `docs/records/frontend-ui-visual-direction-2026-05-21.md` を参照する。この section は思想の要約であり、実装時の具体的な UI layer / palette / information density は visual direction record に従って確認する。

Design thesis:

```text
A unified note surface for a quiet external brain, centered on writing.
静かな外部脳のための、書くことを中心にした統一ノートサーフェス。
```

This app is not an AI chat app, a Notion clone, or a graph-first PKM tool. Its writing surface may use a Notion-like block editor and Markdown-compatible shortcuts, but the product is a note surface where the user's naturally written thinking remains the source of truth, while AI quietly remembers, connects, structures, and returns useful organization inside the same note when the user needs it.

The UI is not a place to demonstrate AI capability. The UI is a place where the user can keep writing, inspect AI-derived organization, and edit, hold, or remove it without losing control. AI Assist does not require a mandatory approval step before it appears in the note surface.

### Product Feel

The primary experience is writing and reviewing a note. AI should feel like a careful background assistant, not the main surface.

Design principles:

- The note is the first-viewport focus.
- The actual writing area should be obvious at first glance: a Notion-like document surface with title, editable blocks, and an empty-line placeholder.
- Markdown-compatible shortcuts are input affordances only; Markdown text is not the frontend or backend source of truth.
- AI is present but secondary: Note First, AI Second.
- User-authored content and AI-generated content must be visually distinguishable.
- Next-open digest should be discoverable without interrupting writing.
- Memory candidates must show user control and source/provenance.
- Provenance is a trust surface: it should be inspectable when needed, not a constant visual interruption.
- Avoid decorative hero layouts, large marketing composition, and purely illustrative content for the app surface.
- Persistent AI chat / interpretation panes must not become the primary UX. AI / digest / memory / provenance may appear as inline blocks, compact digest, secondary regions, drawers, or popovers when the contract allows it.

### Layout

The default layout should prioritize writing flow:

```text
primary surface: note title, sections, blocks, editor interactions
secondary surface: digest, AI assist, memory candidates, provenance details
supporting surface: navigation, status, account/workspace controls
```

Guidelines:

- First viewport should clearly communicate the current note and editable writing surface.
- The note body should use the most stable and spacious region.
- AI / digest / memory should live in a secondary panel, inline assist block, drawer, popover, or collapsible region depending on the contract.
- Avoid nested cards and floating decorative sections.
- Repeated items may use compact cards with restrained borders, but page sections should not become card stacks.
- Mobile layout should preserve the writing surface first, then expose digest / AI / memory through tabs, drawers, or stacked secondary regions.

### Visual Hierarchy

User-authored content is visually primary.

Hierarchy:

1. note title and user-authored blocks.
2. section structure and block-level editing controls.
3. digest / AI assist / memory candidate surfaces.
4. provenance and metadata.
5. developer or configuration errors.

AI-generated content must never look identical to user-authored content. It should have a distinct but quiet treatment such as a subtle label, left rule, icon, or surface tint. The distinction must not rely on color alone.

AI-generated content may be editable, dismissible, and inspectable, but the frontend must not decide that an AI projection has become canonical user-authored source of truth. Any canonical mutation or promotion remains a backend command / operation boundary concern.

### Interaction Design

The UI should optimize for repeated intellectual work rather than novelty.

Interaction rules:

- Editing a user block should feel direct and low-friction.
- Markdown-compatible shortcuts should feel like ordinary writing and resolve into block intent / block structure, not a separate Markdown mode.
- AI controls should not steal focus while the user is typing.
- AI assist insertion, digest refresh, memory updates, and save result rendering must preserve focus, selection, IME composition, and dirty drafts.
- Manual Organize is a user-invoked command, not an AI mode-toggle surface.
- Destructive or state-changing actions should have clear affordances.
- Use icon buttons for common tools when a familiar icon exists, with accessible labels or tooltips.
- Use text buttons for explicit commands such as `Source`, `Edit`, `Hold`, or `Delete`. AI Assist should not require `Accept` as the default happy path.
- Use segmented controls, tabs, toggles, sliders, and menus only where they match the control semantics.
- Avoid visible instructional copy that explains the app architecture or implementation mechanics.

### State Design

Every visible state should communicate what the user can safely do next.

Required states:

- loading note.
- note load failure.
- empty note.
- dirty block draft.
- block save pending.
- block save failed.
- leave / structure trigger pending.
- digest unavailable.
- digest available but empty.
- AI assist edit / delete / source-inspection pending and failed where those actions call backend boundaries.
- memory action pending and failed.

Frontend should display these states but should not invent backend state transitions.

### No Invented State

The frontend must be honest about what the backend has and has not returned.

Rules:

- Do not generate operation IDs, memory IDs, provenance IDs, source span IDs, note IDs, or block IDs.
- Do not create fake digest items, fake provenance, fake related notes, or fake memory candidates from missing references.
- Do not infer operation / memory / provenance mapping when caller-supplied mappings are absent.
- Empty, missing, unavailable, or not-configured states should remain visible as such.
- UI convenience grouping may happen in presenters, but product semantic grouping must come from backend contracts.

### Typography And Density

The product should feel calm, dense enough for work, and easy to scan.

Guidelines:

- Reserve large type for note title and top-level page identity.
- Use compact headings inside panels, cards, sidebars, and tool surfaces.
- Avoid viewport-width font scaling.
- Use stable dimensions for block controls, side panels, digest items, and action buttons to prevent layout shift.
- Text must fit inside buttons and controls across mobile and desktop.

### Color And Surface Treatment

Use a restrained, neutral work-tool palette with meaningful accents.

Guidelines:

- Avoid one-note palettes dominated by a single hue.
- Avoid decorative gradient blobs, bokeh, or ornamental backgrounds.
- Use color to support state and provenance, not as the main information carrier.
- Error, pending, accepted, dismissed, and held states should be distinguishable through label/icon/text as well as color.

### Accessibility

Accessibility is part of the design contract.

Requirements:

- All interactive controls have accessible names.
- Keyboard navigation must reach editor controls, digest actions, operation actions, and memory actions.
- Focus states are visible.
- AI/user distinction does not rely on color alone.
- Pending and error states are announced or visible near the affected action.

### Design Stop Conditions

Stop and revisit design / contract alignment if:

- UI needs backend fields that are presentation-only.
- AI content cannot be visually distinguished from user-authored content.
- writing is blocked by digest, memory, or AI surfaces.
- mobile layout hides the note surface behind secondary AI UI.
- a component requires product policy to decide whether an action is allowed.
- rendering AI / digest / memory updates breaks focus, selection, IME composition, or dirty draft preservation.
- UI needs to fabricate operation, memory, provenance, digest, note, block, or source span references.

## Test Strategy

Prefer workflow tests over many low-value component tests in the first slice.

Workflow tests:

- note loads and blocks render.
- editing a block calls `PATCH /blocks/:blockId`.
- Markdown-compatible shortcuts create block intent / block structure without making Markdown the canonical state.
- leaving note calls `POST /notes/:noteId/leave`.
- digest loads and renders.
- AI Assist renders as an AI-origin inline block without requiring a mandatory accept step.
- AI Assist source inspection, edit, and delete keep user-authored blocks untouched.
- memory accept/reject/edit/hold/delete call the corresponding endpoints.

Frontend topology guard candidates:

- `shared-ui` imports no product modules.
- `runtime/api-client` imports no React and no feature UI modules.
- feature components do not call `fetch` directly.
- presenters do not call APIs.
- `app/` does not own product rules.
- API path literals are centralized in `runtime/api-client`.

## Stop Conditions

Stop and update/review the owner contract before implementation continues if:

- frontend needs a backend field that is product semantic and missing from `docs/contracts/**`.
- UI cannot distinguish user-authored block from AI-generated projection with current backend response.
- UI needs to make an operation safety, memory eligibility, or canonical mutation decision locally.
- implementing the first slice requires changing MVP scope.
- frontend convenience starts to shape backend API responses.
