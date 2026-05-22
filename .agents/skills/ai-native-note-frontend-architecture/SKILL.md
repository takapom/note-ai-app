---
name: ai-native-note-frontend-architecture
description: >-
  AI Native Note の frontend 実装構造、module topology、feature folder、presenter、runtime/api-client、shared-ui の責務分割を設計または実装するときに使う。backend-owned semantics を frontend に再実装しない構造を守る。
---

# AI Native Note Frontend Architecture

## Core rule

Frontend は backend-owned state を表示し、user intent を backend command に変換する。product semantics、state transition、AI operation policy、memory eligibility、section boundary、persistence は frontend の責務ではない。

## Required sources

まず contracts を読む:

- `docs/contracts/frontend-ui.md`
- `docs/contracts/unified-note-surface.md`
- `docs/contracts/api-events.md`
- `docs/contracts/repository-topology.md`
- `apps/web/docs/ui-surface-contract.md`

次に読む:

- `docs/records/frontend-architecture-implementation-plan-2026-05-20.md`

visual / interaction の判断には `$ai-native-note-ui-design` も使う。

## Target topology

backend concept を mirror する bounded frontend module を使う。ただし backend domain rule は再実装しない。

- Compatibility facades: `noteSurface.ts`, `noteSurfaceBrowserRuntime.ts`, `noteSurfaceDomHost.ts`, `noteSurfaceHtmlRenderer.ts` は既存 public import path と source guard を維持する。薄い facade に留め、実装責務を戻さない。
- `note-surface/`: view-model types、presenters、block/chrome rendering、HTML render event composition。
- `runtime/browser/`: browser runtime projection state、local UI actions、DOM globals を持たない controller / transport coordination。
- `runtime/dom/`: real DOM host adapter、selection/focus restoration、composition state observation。
- `digest/`: next-open digest parsing / presentation。
- `provenance/`: bounded provenance popover presentation。
- `shared-ui/`: HTML escaping など product-independent primitive のみ。
- 既存 root-level API transport / intent / bootstrap / product app files は、後続 migration で `runtime/api-client/` や `app/` へ明示移動するまでは framework-neutral composition boundary として維持する。

frontend module を作成・移動する前に `references/topology.md` を読む。

## Implementation workflow

1. slice の owner contract を確認する。
2. component-level integration の前に API client function を追加する。
3. backend DTO を frontend view model に変換する presenter を追加する。
4. raw complex DTO ではなく view model から UI を render する。
5. ephemeral state は interaction component に局所化する。
6. direct `fetch`、shared-ui import、presenter API call、runtime/browser DOM globals、API transport UI import を検出する workflow test / topology guard 候補を追加する。

## Stop conditions

frontend が product eligibility、operation safety、canonical mutation、structure scheduling、memory context eligibility、section boundary semantics を判断する必要が出たら止まる。
