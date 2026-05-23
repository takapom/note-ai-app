# Valibot Adoption Review

ドキュメント種別: record  
日付: 2026-05-23  
関連する active contracts: `docs/contracts/repository-topology.md`, `docs/contracts/documentation-system.md`, `docs/contracts/app-note-model.md`, `docs/contracts/context-assembly.md`, `docs/contracts/memory.md`, `docs/contracts/operation-return-contract.md`, `docs/contracts/api-events.md`, `docs/contracts/verification-lanes.md`, `docs/contracts/vendor-lock-avoidance.md`

## 目的

Valibot を runtime validation の実装手段として導入する場合に、現在の実装状況から見た導入順序、置き場所、避けるべき境界漏れ、検証項目を整理する。

この record は active policy ではない。実装時の authority は関連する `docs/contracts/**` と `contexts/*/src/contract/*` である。

## Valibot の確認事項

2026-05-23 時点で公式ドキュメントから確認した API:

- `v.safeParse(schema, input)` は unknown input を非 throw で検証し、成功時は `output`、失敗時は `issues` を返す。
- `v.parse(schema, input)` は失敗時に throw する。
- `v.InferOutput<typeof Schema>` は `parse` / `safeParse` 後の output 型を推論する。
- `v.object(...)` は unknown key を output から落とす。`v.strictObject(...)` は unknown key を issue にする。
- `v.pipe(...)`, `v.check(...)`, `v.transform(...)`, `v.picklist(...)`, `v.variant(...)`, `v.optional(...)`, `v.nullable(...)`, `v.array(...)`, `v.record(...)` で現在の手書き structural validation の大半は表現できる。

参照: `https://valibot.dev/api/safeParse/`, `https://valibot.dev/api/strictObject/`, `https://valibot.dev/guides/infer-types/`

## 現在の実装状況

依存関係:

- root `package.json` に runtime dependencies はない。
- `apps/web/package.json` は Next / React のみを runtime dependency として持つ。
- `contexts/*` には個別の `package.json` がない。`contexts/*/src/contract/*` は root TypeScript build と tests から直接 import され、`apps/web` / `apps/worker` からも consumed される。
- 現在 Valibot / Zod 系の validation library は未導入。

validation の現状:

- `contexts/note-model/src/contract/noteValidation.ts`
  - Note / Section / Block の live semantics を手書き validator が所有している。
  - structural shape だけでなく、block type と origin の対応、H1/H2/H3 heading content、annotation span、unique id、document reference を検証している。
  - `apps/web/src/note-surface/noteSurfacePresenter.ts` はこの validator を利用し、Web 側で document semantics を再実装しないようにしている。
- `contexts/ai-operations/src/contract/operationContract.ts`
  - AI provider から来る operation list の shape、forbidden operation、policy classification、source span、confidence、position を手書きで検証している。
  - `tests/contracts/operation-schema-runtime.test.mjs` は error message を exact に確認している。
- `contexts/context-assembly/src/contract/contextEnvelopeValidation.ts`
  - ContextEnvelope の structural validation に加えて、full workspace / full note / dump field の再帰検出、trusted content boundary の再帰検出、K limit、budget、source-backed memory provenance を検証している。
  - ここは security lane と context lane の交差点であり、単純な schema parse に置き換えると危険。
- `contexts/memory/src/contract/memoryContract.ts`
  - MemoryItem の source-backed provenance、confidence、status lifecycle を検証している。
- `contexts/scheduler/src/contract/structureSchedulerPlanning.ts`
  - BlockChanged と StructureJob planning request を手書き validation している。
- `apps/worker/src/runtime/http/workerHttpRouteParsers.ts`
  - HTTP boundary の base request / provenance lookup body を検証している。
  - runtime adapter detail であり、product policy owner ではない。
- `apps/web/src/noteSurfaceApiIntents.ts`, `apps/web/src/browserNoteSurfaceMount.ts`, `apps/web/src/noteSurfaceApiTransport.ts`
  - Browser / UI / transport 境界で caller supplied values を検証している。
  - Web は Note / Operation / Memory の product semantics を所有しない。
- Worker SQL row mappers / ports
  - DB rows, JSON columns, request objects の validation が散在している。
  - これらは volatile adapter detail であり、canonical product semantics とは分離する必要がある。

## Primary Design Concern

`dependency-stability` が primary concern である。Valibot は validation 実装の detail であり、Note Model / Context Assembly / Memory / AI Operations の stable product semantics が Valibot の issue shape、strip behavior、schema vocabulary に直接依存してはいけない。

Secondary concerns:

- `boundary-design`: schema を置く module が owner boundary を越えると、Web / Worker が product policy を所有し始める。
- `knowledge-cohesion`: 同じ primitive validation が複数箇所にあるが、shared convenience package は repository topology 上の近道になりやすい。
- `testability-as-design`: 現在の tests は error message を exact に見る箇所があるため、schema migration 前に characterization が必要。

## 導入方針

Valibot は「契約を置き換える」ものではなく、「契約 validator の内部実装」として導入する。

維持する public API:

- `validateBlockContract(input).errors`
- `validateNoteDocumentContract(input).errors`
- `validateStructureOperation(input).errors`
- `validateOperationList(input).errors`
- `validateContextEnvelope(input).errors`
- `validateMemoryItem(input).errors`
- Worker / Web boundary の `{ ok, errors }` または `string[]`

避けること:

- `v.InferOutput` を理由に既存 exported contract interfaces を削除しない。既存の `*Types.ts` / contract files は live product vocabulary の読みやすさを担っている。
- Valibot `issues` を public API として返さない。caller-facing failure meaning は既存の stable `string[]` / `{ ok, errors }` に map する。
- `v.object` の unknown key strip 後の output だけを security check に渡さない。ContextEnvelope の forbidden dump / trusted boundary scan は raw input に対して行う。
- `strictObject` を一括適用しない。現在の validator は多くの unknown key を黙って無視しているため、strict 化は behavioral change であり、contract と tests の更新を伴う。
- root 直下や shared package に generic `validation.ts` を作らない。owner vocabulary のない shared convenience package は topology の近道になる。
- Web / Worker adapter schema から Note / Operation / Memory の product rule を再定義しない。

## Package 導入

実装フェーズで最初に行う依存追加:

- root `package.json` の `"dependencies"` に `valibot` を追加する。
- `package-lock.json` は package manager で更新する。

理由:

- `contexts/*` は個別 package ではなく root build/test から直接 import される。
- Valibot を `contexts/*/src/contract/*` で runtime import する場合、devDependency ではなく runtime dependency である。
- `apps/web` が workspace-isolated deploy される運用に変わる場合だけ、`apps/web/package.json` への依存追加を別途検討する。現状の root workspace 前提では root dependency が最小。

## 推奨導入順

### Phase 1: AI Operations schema

最初の対象は `contexts/ai-operations/src/contract/operationContract.ts`。

理由:

- AI provider output は untrusted runtime input であり、schema validation の効果が大きい。
- Operation Router が product policy owner として明確。
- `tests/contracts/operation-schema-runtime.test.mjs` が既に narrow で、migration regression を検出しやすい。
- ContextEnvelope より security pre-scan が少なく、Valibot の strip behavior による bypass risk が小さい。

実装形:

- `operationSchemas.ts` または `operationValidationSchemas.ts` を同じ contract directory に置く。
- `SourceSpanSchema`, `OperationPositionSchema`, operation type ごとの object schema を作る。
- `validateStructureOperation` は public signature を維持し、内部で `v.safeParse` を使う。
- forbidden type と unknown type の error message は既存と同等に維持する。
- `classifyOperationPolicy` は schema から独立した product policy function のままにする。

注意:

- `v.variant('type', [...])` は discriminated union に適するが、forbidden operation type の message は variant issue だけでは既存 message と一致しない可能性がある。type pre-check を残す方が安全。
- 初期 migration では `v.object` で unknown key を無視し、現在の behavior を保つ。strict 化は別 PR。

最小検証:

- `node --test tests/contracts/operation-schema-runtime.test.mjs tests/contracts/operation-router-runtime.test.mjs`
- `node --test tests/contracts/worker-operation-routing-flow.test.mjs tests/contracts/worker-structure-job-operation-flow.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Phase 2: Memory item schema

対象は `contexts/memory/src/contract/memoryContract.ts`。

理由:

- MemoryItem は source-backed provenance と lifecycle が重要で、shape validation と semantic validation の境界が明確。
- `validateMemoryItem` を維持したまま schema 化しやすい。

実装形:

- `MemorySourceSpanSchema`, `MemoryItemSchema` を context local に置く。
- `hasMemorySourceProvenance`, `isContextEligibleMemory`, `transitionMemoryStatus` は domain behavior として残す。
- source provenance の「sourceUnitId / sourceNoteId / sourceSpan のどれか必須」は `v.check` か parse 後の explicit check にする。error message を保つため parse 後 check が安全。

最小検証:

- `node --test tests/contracts/memory-runtime.test.mjs tests/contracts/worker-memory-review-port.test.mjs tests/contracts/worker-memory-candidate-proposal-boundary.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Phase 3: Note Model block/document schema

対象は `contexts/note-model/src/contract/noteValidation.ts`。

理由:

- Web と Worker の両方が利用する中心 contract。
- 手書き validation の量が多く、Valibot の structural schema 化による保守効果が大きい。

実装形:

- `noteValidationSchemas.ts` を context local に置く。
- block content は `type` と `contentJson` の関係があるため、schema だけで全てを表現しようとしない。
- `BlockShapeSchema` で base fields を検証し、`blockOriginMatchesType`, heading / todo / divider content rules, document unique ids / references は既存 function または parse 後 check に残す。
- `validateNoteDocumentContract` の cross-reference checks は schema 化しない。document aggregate の invariant であり、schema shape ではない。

最小検証:

- `node --test tests/contracts/note-model-runtime.test.mjs tests/contracts/worker-note-document-persistence-port.test.mjs tests/contracts/worker-note-block-command-port.test.mjs`
- `node --test tests/contracts/web-note-surface.test.mjs tests/contracts/web-note-surface-product-state.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Phase 4: ContextEnvelope schema

対象は `contexts/context-assembly/src/contract/contextEnvelopeValidation.ts`。

理由:

- ContextEnvelope は high value だが high risk。
- Raw input の recursive security scans、budget estimate、K limit、untrusted boundary が混ざっているため、schema-only refactor は危険。

実装形:

- Raw input に対する `hasForbiddenContextDumpField` と `hasTrustedContentBoundary` を parse 前に必ず実行する。
- Valibot は required skeleton と primitive shape に限定する。
- `validateUntrustedBoundary`, budget estimate, source-backed memory provenance, K limit は explicit checks として残す。
- `v.object` の strip output を security decision に使わない。

最小検証:

- `node --test tests/contracts/context-assembly-runtime.test.mjs tests/contracts/worker-context-assembly-flow.test.mjs tests/contracts/worker-operation-generation-provider-flow.test.mjs`
- `node --test tests/contracts/topology-runtime.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Phase 5: Runtime edge schemas

対象は Worker HTTP parser、Web API intents、browser mount、transport、SQL row mappers。

導入基準:

- Product contract validator が先に schema 化されていること。
- Runtime adapter schema は transport / row shape の validation に限定すること。
- Product semantics は context contract validator を呼ぶこと。

候補:

- `apps/worker/src/runtime/http/workerHttpRouteParsers.ts`
- `apps/web/src/noteSurfaceApiIntents.ts`
- `apps/web/src/browserNoteSurfaceMount.ts`
- `apps/web/src/noteSurfaceApiTransport.ts`
- SQL row mappers with JSON columns

注意:

- DB row schema は volatile storage detail であり、domain schema と共有しない。
- OpenAPI は generated projection であり、Valibot schema から OpenAPI を生成する判断は別途 contract 変更が必要。

最小検証:

- `node --test tests/contracts/worker-http-router.test.mjs tests/contracts/worker-http-error-responses.test.mjs`
- `node --test tests/contracts/web-note-surface-api-intents.test.mjs tests/contracts/web-note-surface-api-transport.test.mjs tests/contracts/web-browser-note-surface-mount.test.mjs`
- affected SQL adapter tests
- `tsc -p tsconfig.json --noEmit`

## Error Mapping 方針

Valibot issue message はそのまま stable error にしない。

推奨 helper は context local に置く:

```ts
function schemaErrors(result: v.SafeParseResult<typeof Schema>, fallbackPrefix?: string): string[] {
  if (result.success) {
    return [];
  }
  return result.issues.map((issue) => mapIssueToStableMessage(issue, fallbackPrefix));
}
```

ただし、最初の導入では汎用 mapper を作りすぎない。既存 tests が exact message を確認している箇所では、field ごとの explicit message を優先する。

## `object` / `strictObject` の使い分け

初期導入:

- 既存 validator が unknown key を無視している public contract では `v.object` を使い、behavior を維持する。
- HTTP body や provider output で unknown key を拒否する product / security requirement が contract に明記されている箇所だけ `v.strictObject` を使う。
- ContextEnvelope は unknown key の中に forbidden dump / trusted boundary が隠れる可能性があるため、`object` strip 後に security scan しない。

将来の strict 化:

- strict 化は Valibot 導入とは別の behavioral change として扱う。
- 対象 contract に「unknown keys are rejected」を明記し、error response tests を更新してから行う。

## 導入しないほうがよい場所

- `docs/contracts/**`: Valibot 固有 API を policy として書かない。契約は product semantics を述べる。
- generated OpenAPI: projection であり、Valibot schema の source of truth にしない。
- Provider registry / AI SDK adapter: provider abstraction と operation schema validation を結合しない。
- Shared generic validation package: owner vocabulary のない shared package は forbidden shortcut になりやすい。
- UI component props: UI rendering props のために product contract schema を再定義しない。presenter / API boundary で validation する。

## 実装完了条件

Valibot 導入の completion は dependency 追加だけではない。少なくとも次を満たす必要がある。

- Valibot は root runtime dependency として lock file に記録されている。
- 最初の owner context の validator が Valibot-backed になり、public signature と stable error meaning を維持している。
- 対象 context の contract tests が green。
- `tsc -p tsconfig.json --noEmit` が green。
- `rg -n "from 'valibot'|from \"valibot\"" contexts apps` で import が owner contract または adapter boundary に限定されていることを確認できる。
- Web / Worker が Note / Operation / Memory semantics を再実装していない。
- ContextEnvelope では raw security scans が parse 前に残っている。

## 推奨する最初の PR

最初の PR は Phase 1 のみに絞る。

変更内容:

- root `package.json` / `package-lock.json` に `valibot` を追加。
- `contexts/ai-operations/src/contract/operationValidationSchemas.ts` を追加。
- `validateStructureOperation` / `validateOperationList` の public behavior を維持したまま structural checks を schema-backed にする。
- `tests/contracts/operation-schema-runtime.test.mjs` に unknown key preservation / forbidden type / variant error の characterization を足す。

実行する検証:

- `node --test tests/contracts/operation-schema-runtime.test.mjs tests/contracts/operation-router-runtime.test.mjs`
- `node --test tests/contracts/worker-operation-routing-flow.test.mjs tests/contracts/worker-structure-job-operation-flow.test.mjs`
- `tsc -p tsconfig.json --noEmit`
- `npm run lint` または `npm run contracts:verify -- --lint`

残リスク:

- exact error message を保つため、Valibot の issue message を直接使う実装は避ける必要がある。
- `v.object` の strip behavior は便利だが、security boundary では bypass を生む可能性がある。
- 将来 OpenAPI 生成と統合したくなる可能性があるが、現 contract topology では generated projection を authority にしてはいけない。
