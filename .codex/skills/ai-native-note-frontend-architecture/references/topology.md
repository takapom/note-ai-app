# Frontend Topology Reference

Source of record: `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`.

## Current shape

```text
apps/web/src
├─ noteSurface.ts                         # compatibility facade only
├─ noteSurfaceBrowserRuntime.ts           # compatibility facade only
├─ noteSurfaceDomHost.ts                  # compatibility facade only
├─ noteSurfaceHtmlRenderer.ts             # compatibility facade only
├─ note-surface/
├─ digest/
├─ provenance/
├─ runtime/
│  ├─ browser/
│  └─ dom/
└─ shared-ui/
```

Root-level API intent / transport / bootstrap / product app files remain
framework-neutral composition boundaries for now. Move them only through an
explicit migration that preserves the existing source guards.

## Allowed direction

```text
compatibility facades
  -> re-export implementation modules only
  -> no product behavior ownership

note-surface / digest / provenance
  -> shared-ui
  -> local view-model and presenter modules
  -> no transport calls

presenter
  -> backend DTO types or local view-model types
  -> no API calls

runtime/browser
  -> renderer / event controller / injected host contracts
  -> no real DOM globals

runtime/dom
  -> real DOM APIs only
  -> no transport, backend policy, or canonical mutation

root API transport / intent files
  -> fetch-like transport primitives
  -> no UI modules

shared-ui
  -> no product modules
```

## Forbidden examples

- `shared-ui -> note-surface`
- `shared-ui -> digest`
- `shared-ui -> provenance`
- `runtime/browser -> document`
- `runtime/browser -> window`
- `root API transport -> note-surface`
- component-level direct `fetch('/notes/...')`
- backend API response shaped by React component props

## Migration guidance

1. Keep facades thin while callers still import the legacy root files.
2. Put new note rendering and view-model work under `note-surface/`.
3. Put local browser projection and action state under `runtime/browser/`.
4. Put Selection API, `innerHTML`, and event listener ownership under `runtime/dom/`.
5. Put digest and provenance presentation in their dedicated feature folders.
6. Keep `shared-ui/` product-independent.
7. Do not move root API transport / product composition files unless the source guards are migrated with them.
