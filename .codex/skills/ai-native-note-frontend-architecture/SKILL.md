---
name: ai-native-note-frontend-architecture
description: >-
  AI Native Note の frontend 実装構造、module topology、feature folder、presenter、runtime/api-client、shared-ui の責務分割を設計または実装するときに使う。backend-owned semantics を frontend に再実装しない構造を守る。
---

# AI Native Note Frontend Architecture

## Core rule

Frontend displays backend-owned state and converts user intent into backend commands. It does not own product semantics, state transitions, AI operation policy, memory eligibility, section boundaries, or persistence.

## Required sources

Read contracts first:

- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `docs/contracts/api-events.md`
- `docs/contracts/repository-topology.md`
- `apps/web/docs/ui-surface-contract.md`

Then read:

- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

For visual and interaction choices, also use `$ai-native-note-ui-design`.

## Target topology

Use bounded frontend modules that mirror backend concepts without reimplementing backend domain rules:

- Compatibility facades: `noteSurface.ts`, `noteSurfaceBrowserRuntime.ts`, `noteSurfaceDomHost.ts`, and `noteSurfaceHtmlRenderer.ts` preserve existing public import paths and source guards. They should stay thin and should not regain implementation ownership.
- `note-surface/`: view-model types, presenters, block/chrome rendering, HTML render event composition.
- `runtime/browser/`: browser runtime projection state, local UI actions, controller/transport coordination without DOM globals.
- `runtime/dom/`: real DOM host adapter, selection/focus restoration, composition state observation.
- `digest/`: next-open digest parsing and presentation.
- `provenance/`: bounded provenance popover presentation.
- `shared-ui/`: product-independent primitives such as HTML escaping only.
- Existing root-level API transport / intent / bootstrap / product app files remain framework-neutral composition boundaries unless a later migration explicitly moves them under `runtime/api-client/` or `app/`.

Read `references/topology.md` before creating or moving frontend modules.

## Implementation workflow

1. Confirm the owner contract for the slice.
2. Add API client functions before component-level integration.
3. Add presenters that convert backend DTOs into frontend view models.
4. Render UI from view models, not raw complex DTOs.
5. Keep ephemeral state local to interaction components.
6. Add workflow tests and topology guard candidates for direct `fetch`, shared-ui imports, presenter API calls, runtime/browser DOM globals, and API transport UI imports.

## Stop conditions

Stop if the implementation requires frontend to decide product eligibility, operation safety, canonical mutation, structure scheduling, memory context eligibility, or section boundary semantics.
