# Records / ADR Index

ドキュメント種別: record index

この directory は履歴と判断背景を保持します。active policy、invariant、scope、topology の SoT は `docs/contracts/**` です。実装判断で record / ADR と contract が矛盾する場合は contract を優先します。

architecture、bounded context、document model、scheduler、AI operation、runtime topology を変更する場合は、owner contract を確認した後、関連する record / ADR を背景として確認してください。record / ADR にしか存在しない判断を実装に使う場合は、先に該当内容を owner contract へ反映してください。

## ADR

| Record | 主題 | 関連する active contracts |
| --- | --- | --- |
| `ADR-0001-ai-native-note-target-model.md` | 統一ノートサーフェス、AI 由来構造、ユーザー著作 content の SoT | `docs/contracts/product-principles.md`, `docs/contracts/mvp-scope.md`, `docs/contracts/unified-note-surface.md`, `docs/contracts/frontend-ui.md` |
| `ADR-0002-ai-structuring-trigger.md` | AI 構造化 trigger、no per-keystroke structuring、next open digest | `docs/contracts/ai-structuring-lifecycle.md`, `docs/contracts/mvp-acceptance.md`, `docs/contracts/api-events.md` |
| `ADR-0003-block-section-document-model.md` | Block / Section model、Markdown 非 SoT、H1/H2/H3 section boundary | `docs/contracts/app-note-model.md`, `docs/contracts/data-model.md`, `docs/contracts/sot-and-projection.md` |
| `ADR-0004-bounded-context-map.md` | bounded context map、責務、依存方向 | `docs/contracts/repository-topology.md`, `docs/contracts/authority-graph.md`, `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md` |

## Readiness / Gap Records

| Record | 主題 | 関連する active contracts |
| --- | --- | --- |
| `MVP-acceptance-gap-review-2026-05-18.md` | MVP acceptance の gap review と issue draft | `docs/contracts/mvp-acceptance.md`, `docs/contracts/mvp-scope.md`, `docs/contracts/verification-lanes.md` |
| `backend-ddd-hardening-issues-2026-05-19.md` | backend runtime / persistence / Agent queue hardening issue drafts | `docs/contracts/backend-runtime.md`, `docs/contracts/repository-topology.md`, `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/data-model.md`, `docs/contracts/api-events.md`, `docs/contracts/verification-lanes.md` |
| `backend-readiness-review-2026-05-19.md` | backend readiness completion evidence | `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/repository-topology.md` |
| `local-cloudworker-agents-issues-2026-05-19.md` | local Cloudflare Worker / Durable Object Agents smoke and issue drafts | `docs/contracts/backend-runtime.md`, `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/verification-lanes.md` |
| `valibot-adoption-review-2026-05-23.md` | Valibot runtime validation adoption review | `docs/contracts/repository-topology.md`, `docs/contracts/app-note-model.md`, `docs/contracts/context-assembly.md`, `docs/contracts/memory.md`, `docs/contracts/operation-return-contract.md`, `docs/contracts/api-events.md`, `docs/contracts/verification-lanes.md` |
