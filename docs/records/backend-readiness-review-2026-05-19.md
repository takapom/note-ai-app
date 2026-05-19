# Backend Readiness Review - 2026-05-19

ドキュメント種別: record
権威: `docs/records/backend-ddd-hardening-issues-2026-05-19.md` に対する実装完了証跡
オーナー: Codex review
ステータス: active

## 目的

UI 実装 / polish に進む前に、backend runtime、DDD bounded context、persistence readiness、Agent queue、failure recovery、smoke / curl-like lane が保守可能な責務分割になっているかを確認する。

## 結論

BAH-01 から BAH-07 まで completed。blocking architecture finding はない。

UI 実装前の backend readiness は満たしている。ただし GitHub issue / PR / push の traceability projection は sandbox 外の作業として残る。

## 完了した境界

- Architecture guard baseline: contexts / Worker / Web の forbidden dependency と generated projection authority shortcut を guard。
- Canonical Turso readiness: current canonical SQL adapters と schema fixture の table / column drift を guard。
- Agent-local SQL readiness: dirty marks、StructureJob queue、next-open digest、audit recovery queue を temporary schema fixture に分離。
- Agent queue runtime: WorkspaceBrain processor が deployment bindings 由来の runtime options から queued job processing に進める。
- Error / recovery boundary: audit / recovery / projection / proposal / HTTP failure は stable runtime meaning に正規化。
- Backend smoke: Worker fetch boundary を curl-like に叩き、note/block/structure/digest/provenance/memory/operation routes と failure responses を確認。

## Review Findings

独立 review subagent は最初に 2 件の blocking finding を出した。

1. `WorkspaceBrainAgent.processNextQueuedStructureJob` が ad-hoc env options だけに依存し、deployable runtime wiring が未完成。
2. Durable Object options provider failure が raw `error.message` / string detail を public RPC result に漏らす。

修正:

- `apps/worker/src/workerRuntimePorts.ts` に `createWorkspaceBrainStructureJobProcessorOptions` を追加し、Turso / Agent-local SQL / provider registry / Operation Router snapshot から processor options を構成。
- `apps/worker/src/cloudflareDurableObjectAgents.ts` は ad-hoc test seam がない場合、Worker runtime port wiring へ fallback。
- DO/RPC options failure は stable `workspace brain processor ports are not configured` に正規化。
- `docs/contracts/backend-runtime.md` と `docs/contracts/cloudflare-agents-turso.md` に決定事項を反映。

再レビュー結果:

- blocking finding なし。
- non-blocking finding なし。

## Verification

Pass:

- `node --test --test-reporter=dot tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`
- `node scripts/verify-contracts.mjs --lint`
- `node scripts/generate-doc-register.mjs --check`
- `git diff --check`
- `node --test tests/contracts/backend-runtime-smoke.test.mjs tests/contracts/worker-entrypoint.test.mjs tests/contracts/worker-http-router.test.mjs tests/contracts/hosted-note-surface-e2e.test.mjs`

Notes:

- Parallel full test initially exposed a `dist/web` build artifact race between hosted/browser build tests. `scripts/build-web.mjs` now overwrites the build output without deleting `dist/web` first, and the parallel full test passes.
- Chrome real browser editor guard was previously passed by the user on 2026-05-19 and is not re-run in this backend readiness pass.
