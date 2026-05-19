# 検証レーン契約

ドキュメント種別: contract  
権威: validation lanes の信頼できる唯一の情報源  
オーナー: quality オーナー  
付随契約: documentation-system.md, superset-codex-workflow.md, non-functional-requirements.md, mvp-acceptance.md  
生成済み companion: docs/generated/verification-lanes.json  
検証レーン: generated lane register を通じた itself  
ステータス: active

## 目的

各 change type で確認しなければならない内容を定義する。

## この契約が所有するもの


- 検証レーンの分類。
- lane ごとの Required checks。
- レビュー責務。
- MVP acceptance checklist。


## この契約が所有しないもの


- Specific CI provider YAML。
- Test runner implementation。


## 不変条件


レーン:
- contract lane: contract consistency、generated register、authority graph.
- note model lane: schema tests、section boundary tests.
- operation lane: schema validation、router accept/reject/revert tests.
- scheduler lane: BlockChanged で AI なし、note leave が job を作成すること。
- context lane: K limits、budget、title/description usage.
- frontend lane: unified surface、chat panel なし、AI blocks inline.
- runtime lane: provider abstraction、Turso canonical boundaries、note structure route handler と StructureJob Agent handler が policy-free connection boundary であること、AI structuring runtime が canonical Note / Section / Block SoT を直接 mutate しないこと。
- security lane: source spans、context minimization、untrusted instruction leakage なし。
- api/event lane: UI events、backend events、route handlers が `api-events.md` に沿っていること。
- NFR lane: writing flow、layout stability、AI failure tolerance、observability event が `non-functional-requirements.md` に沿っていること。
- acceptance lane: `mvp-acceptance.md` の 15 項目を MVP complete 判定に使うこと。

## 現在のコマンド

scaffold 後の標準コマンド:

- typecheck: `npm run typecheck`
- lint: `npm run lint`
- unit tests: `npm run test`
- full verification: `npm run verify`
- generated register check: `npm run docs:register:check`
- contract checks: `npm run contracts:verify`

この環境で `npm run ...` が実行できない場合は、同等の直接コマンドを使用する。

- typecheck: `tsc -p tsconfig.json --noEmit`
- lint: `node scripts/verify-contracts.mjs --lint`
- unit tests: `node --test tests/**/*.test.mjs`
- generated register check: `node scripts/generate-doc-register.mjs --check`

Issue #6 no direct SoT mutation guard の重点コマンド:

- e2e runtime guard: `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- topology runtime guard: `node --test tests/contracts/topology-runtime.test.mjs`

Note Model canonical persistence の重点コマンド:

- port/adapter guard: `node --test tests/contracts/worker-note-document-persistence-port.test.mjs tests/contracts/worker-note-document-sql-adapter.test.mjs`
- AI runtime separation guard: `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs tests/contracts/topology-runtime.test.mjs`

Worker HTTP routing boundary の重点コマンド:

- route/delegation guard: `node --test tests/contracts/worker-entrypoint.test.mjs tests/contracts/worker-http-router.test.mjs`
- auth/workspace boundary guard: `node --test tests/contracts/worker-auth-boundary.test.mjs tests/contracts/worker-entrypoint.test.mjs`
- Cloudflare Agent binding guard: `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs tests/contracts/worker-note-structure-runtime-handlers.test.mjs tests/contracts/worker-structure-job-processor-flow.test.mjs`
- Cloudflare deployment config guard: `node --test tests/contracts/cloudflare-deployment-config.test.mjs`
  - verifies that `wrangler.toml` points `main` at the Worker fetch entrypoint, serves Web build artifacts from `./dist/web`, keeps MVP API route patterns Worker-first via `[assets].run_worker_first`, leaves ordinary static asset paths asset-first, and does not inline Turso/auth/user/workspace secret values.
- runtime boundary guard: `node --test tests/contracts/topology-runtime.test.mjs`

Note Block command / Next Open Digest read boundary の重点コマンド:

- block command guard: `node --test tests/contracts/worker-note-block-command-port.test.mjs`
- digest read guard: `node --test tests/contracts/worker-next-open-digest-read-port.test.mjs`
- router integration guard: `node --test tests/contracts/worker-http-router.test.mjs`

Provenance Popover source lookup boundary の重点コマンド:

- provenance lookup guard: `node --test tests/contracts/worker-provenance-lookup-port.test.mjs`
- runtime topology guard: `node --test tests/contracts/topology-runtime.test.mjs`

Memory candidate review runtime boundary の重点コマンド:

- memory review guard: `node --test tests/contracts/worker-memory-review-port.test.mjs tests/contracts/memory-runtime.test.mjs`
- router integration guard: `node --test tests/contracts/worker-http-router.test.mjs`

Operation proposal SQL/runtime approval boundary の重点コマンド:

- proposal SQL guard: `node --test tests/contracts/worker-operation-proposal-sql-adapter.test.mjs tests/contracts/worker-operation-proposal-approval-flow.test.mjs`
- Worker default wiring guard: `node --test tests/contracts/worker-entrypoint.test.mjs`

Memory candidate proposal boundary の重点コマンド:

- proposal-to-memory guard: `node --test tests/contracts/worker-http-router.test.mjs tests/contracts/worker-entrypoint.test.mjs tests/contracts/worker-memory-candidate-proposal-boundary.test.mjs tests/contracts/worker-operation-proposal-approval-flow.test.mjs tests/contracts/memory-runtime.test.mjs`
- typecheck: `tsc -p tsconfig.json --noEmit`

Web NoteSurface foundation の重点コマンド:

- note surface guard: `node --test tests/contracts/web-note-surface.test.mjs tests/contracts/note-model-runtime.test.mjs`
- HTML renderer guard: `node --test tests/contracts/web-note-surface-html-renderer.test.mjs tests/contracts/web-note-surface.test.mjs`
- API intent mapping guard: `node --test tests/contracts/web-note-surface-api-intents.test.mjs tests/contracts/web-note-surface.test.mjs`
- API transport guard: `node --test tests/contracts/web-note-surface-api-transport.test.mjs tests/contracts/web-note-surface-api-intents.test.mjs`
- event controller guard: `node --test tests/contracts/web-note-surface-event-controller.test.mjs tests/contracts/web-note-surface-html-renderer.test.mjs tests/contracts/web-note-surface-api-transport.test.mjs`
- action input resolver guard: `node --test tests/contracts/web-note-surface-action-input-resolver.test.mjs tests/contracts/web-note-surface-event-controller.test.mjs tests/contracts/web-note-surface-browser-runtime.test.mjs`
- resolver options from document guard: `node --test tests/contracts/web-note-surface-resolver-options-from-document.test.mjs tests/contracts/web-note-surface-action-input-resolver.test.mjs`
- resolver options from document integration guard: `node --test tests/contracts/web-note-surface-integration-guard.test.mjs tests/contracts/web-note-surface.test.mjs`
- product state composition guard: `node --test tests/contracts/web-note-surface-product-state.test.mjs tests/contracts/web-note-surface-resolver-options-from-document.test.mjs tests/contracts/web-note-surface-app-bootstrap.test.mjs`
- product app entrypoint guard: `node --test tests/contracts/web-note-surface-product-app.test.mjs tests/contracts/web-note-surface-product-state.test.mjs tests/contracts/web-note-surface-app-bootstrap.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- HTTP product provider guard: `node --test tests/contracts/web-note-surface-http-product-provider.test.mjs tests/contracts/web-note-surface-product-app.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- HTTP product provider projection snapshot guard: `node --test tests/contracts/web-note-surface-http-product-provider.test.mjs tests/contracts/web-note-surface-product-state.test.mjs tests/contracts/web-note-surface-product-app.test.mjs`
- HTTP digest product provider boundary guard: `node --test tests/contracts/web-note-surface-http-digest-product-provider.test.mjs tests/contracts/web-note-surface-product-state.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- HTTP product app composition guard: `node --test tests/contracts/web-note-surface-http-product-app.test.mjs tests/contracts/web-note-surface-http-product-provider.test.mjs tests/contracts/web-note-surface-product-app.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- HTTP digest product app composition guard: `node --test tests/contracts/web-note-surface-http-digest-product-app.test.mjs tests/contracts/web-note-surface-http-digest-product-provider.test.mjs tests/contracts/web-note-surface-product-app.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- DOM host adapter guard: `node --test tests/contracts/web-note-surface-dom-host.test.mjs tests/contracts/web-note-surface-browser-runtime.test.mjs tests/contracts/web-note-surface-html-renderer.test.mjs`
  - verifies that explicit block editor save clicks read same-block `textContent` from the marked contenteditable element and send `block.update` as `PATCH /blocks/:blockId` with JSON `{ noteId, content }`, while edit/cancel remain local/no-op and Web does not directly mutate canonical Note / Section / Block.
- browser runtime guard: `node --test tests/contracts/web-note-surface-browser-runtime.test.mjs tests/contracts/web-note-surface-event-controller.test.mjs tests/contracts/web-note-surface-html-renderer.test.mjs tests/contracts/web-note-surface-api-transport.test.mjs`
- app bootstrap guard: `node --test tests/contracts/web-note-surface-app-bootstrap.test.mjs tests/contracts/web-note-surface-dom-host.test.mjs tests/contracts/web-note-surface-action-input-resolver.test.mjs tests/contracts/web-note-surface-browser-runtime.test.mjs`
- integration source guard: `node --test tests/contracts/web-note-surface-integration-guard.test.mjs tests/contracts/web-note-surface.test.mjs`
- browser deployment embedding adapter guard: `node --test tests/contracts/web-browser-note-surface-mount.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
  - verifies that `browserNoteSurfaceMount.ts` owns browser global access, mount target lookup, and deployment-supplied root dataset metadata (`data-api-base-url`, `data-workspace-id`, `data-note-id`, optional `data-user-id`, `data-workspace-name`, `data-expanded-digest`, `data-view-state-json`, `data-projection-maps-json`) as volatile adapter detail only.
  - verifies that projection maps JSON is passed through as response/caller supplied IDs and Web does not generate, complete, or infer operation / memory / provenance / source span / note / block IDs.
- browser app entry deployment bootstrap guard: `node --test tests/contracts/web-browser-note-surface-app-entry.test.mjs tests/contracts/web-browser-note-surface-mount.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
  - verifies that `browserNoteSurfaceAppEntry.ts` has no import-time side effect and starts the mount adapter only through an injected runtime / deployment descriptor.
  - verifies that the browser app entry is deployment bootstrap, not NoteSurface application boundary or domain policy, and does not own framework / bundler package selection, deployment config, provider SDK, auth policy, ID generation, or canonical Note / Section / Block direct mutation.
- browser static build artifact guard: `npm run build:web && node --test tests/contracts/web-browser-static-build.test.mjs`
  - verifies that Web browser delivery copies `apps/web/public` into `dist/web`, emits browser ESM assets through the dedicated TypeScript browser build config, and does not change root `noEmit` typecheck semantics.
  - verifies that `apps/web/public/index.html` is a deployment template that imports the compiled `browserNoteSurfaceAppEntry.js` and explicitly calls `startBrowserNoteSurfaceApp`, while required dataset metadata remains deployment supplied.
  - verifies that browser build artifact paths, deployment metadata, and framework/package selection details do not leak into `apps/web/src/noteSurface*.ts` application files.
- full frontend-safe typecheck: `tsc -p tsconfig.json --noEmit`


## 許可されるトポロジー

すべての Superset task は少なくとも 1 つの lane を選択する。

## 移行用の seam

初期 scaffold タスクでは未実装の lane checks を not-yet-available としてマークしてよいが、上記の標準コマンドを維持し、未実装の理由を述べなければならない。

## 削除対象

validation lane assignment のない tasks を削除する。

## ガード / 検証

Codex review は lane results、not-yet-available checks、blocking MVP gaps を一覧にしなければならない。AI runtime / topology 変更では no direct AI-to-SoT write path の e2e guard、source guard、topology guard の結果を含めなければならない。
