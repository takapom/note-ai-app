# MVP Acceptance Gap Review - 2026-05-18

ドキュメント種別: record
権威: `docs/contracts/mvp-acceptance.md` に対する実装状況の証跡
オーナー: Codex review
ステータス: active

## 目的

`docs/contracts/mvp-acceptance.md` の 15 項目に対し、現在の repo が MVP complete と言えるかを確認し、blocking gap を issue 化できる粒度に分割する。

GitHub issue / push 操作は sandbox policy により `approval required by policy, but AskForApproval is set to Never` で拒否されたため、この記録を issue draft として残す。GitHub 操作が可能な環境では、この記録の "Issue Drafts" をそのまま issue に転記する。

## Acceptance Status

| # | 条件 | 現状 | 根拠 / gap |
| --- | --- | --- | --- |
| 1 | ユーザーが一枚のノートに自然に書ける | partial | dependency-free AppShell / NoteSurface / Block Editor view model、HTML rendering、browser runtime、DOM host、explicit save click -> Worker request wiring、API-free browser projection actions、successful save 後の browser UI projection 更新、repo-local hosted contract E2E は追加済み。残りは production-grade editor ergonomics。 |
| 2 | H1/H2/H3 が section boundary として扱われる | partial | note-model document validation、web NoteSurface view model / renderer、explicit heading save click -> `PATCH /blocks/:blockId`、Worker Note Model command boundary での heading block text + owning section title/contentHash 同時更新、successful heading save 後の browser UI projection 更新、repo-local hosted contract E2E は追加済み。残りは production-grade editor ergonomics。 |
| 3 | blocks と sections が内部正本として保存される | partial | canonical Note document persistence port / SQL adapter、block CRUD command port、HTTP router delegation、Worker fetch default Turso wiring、auth/workspace boundary、Cloudflare Agent binding foundation、wrangler deployment config、Web explicit save click -> `PATCH /blocks/:blockId` wiring、deployment environment values の repo-tracked 直書き禁止 contract / guard、repo-local hosted contract E2E は追加済み。Agent-local save intent は canonical SoT ではない。 |
| 4 | note close / tab switch / app leave で dirty section の structure job が作られる | partial | scheduler domain、worker route handler cause preservation、HTTP router delegation、Worker fetch entrypoint、framework-neutral NoteAgent binding foundation、descriptor-derived Durable Object binding record、wrangler deployment config は対応済み。hosted runtime env/binding injection と exact production auth provider integration は未実装。 |
| 5 | keystroke ごとに AI が呼ばれない | covered | BlockChanged は save/edit/dirty/index のみで provider/router/audit に進まない。 |
| 6 | Context Assembly が title、description、target section、related units、memory を使う | covered | ContextEnvelope contract と worker runtime flow で検証済み。 |
| 7 | AI は operation schema に従って返す | covered | operation list、allowed/forbidden types、source spans、confidence を contract/test で検証済み。 |
| 8 | Operation Router が unsafe operation を reject する | covered | unknown/forbidden operations、unsafe targets、low confidence、invalid audit IDs を reject。 |
| 9 | AI Assist Block が同じノート内に表示される | partial | Web NoteSurface view model、inline AI Assist action intents、Worker request descriptor mapping、fetch-like transport、framework-neutral HTML renderer、event controller、browser runtime、DOM host、action input resolver、app bootstrap、document-derived resolver options、product state composition、product app entrypoint、HTTP product provider、HTTP product app composition guard は追加済み。`GET /notes/:noteId` response の optional projection snapshot は Web が operation IDs を生成せず product state input に写す。browser deployment embedding adapter は global `document` / `fetch`、mount target lookup、deployment-supplied root dataset metadata を `browserNoteSurfaceMount.ts` に閉じる責務であり、browser app entry は injected runtime で mount adapter を起動する deployment bootstrap である。TypeScript browser ESM build artifact path と public deployment template、repo-local hosted contract E2E は追加済み。wrangler config は `./dist/web` static build artifact と Worker API route patterns を同一 Worker deployment に接続する volatile detail として追加済み。deployment environment values の repo-tracked 直書き禁止 contract / guard は追加済み。 |
| 10 | Next Open Digest が表示できる | partial | digest preparation、read boundary、HTTP router delegation、Worker fetch Agent-local wiring、Web compact/expandable view model、digest GET descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver、app bootstrap、document-derived resolver options、product state composition、product app entrypoint、HTTP product provider、HTTP digest product provider boundary、HTTP product app composition guard、HTTP digest product app composition guard、repo-local hosted contract E2E は追加済み。browser runtime は `digest.read` 成功 response body 由来の `nextOpenDigest` projection を UI state に反映して再描画し、failure では既存 projection を保持する。`GET /notes/:noteId` response/caller supplied `nextOpenDigest` は Web が生成・推測せず viewState に渡す。browser deployment embedding adapter / browser app entry / browser ESM build artifact 後も digest projection の意味は application boundary が所有しない。wrangler config は static build artifact serving path と Worker-first API routes だけを所有する。deployment environment values の repo-tracked 直書き禁止 contract / guard は追加済み。 |
| 11 | Memory candidate をノート内で承認または拒否できる | partial | Memory review port / SQL adapter / HTTP router / Worker fetch wiring、`create_memory_candidate` proposal 変換 boundary、Worker accept route/default Turso wiring、Web Memory Candidate action model、remember/edit/different/delete/hold descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver、app bootstrap、document-derived resolver options、product state composition、product app entrypoint、HTTP product provider、HTTP product app composition guard、repo-local hosted contract E2E は追加済み。browser runtime は memory remember/reject/delete/snooze 成功後に該当 candidate block を UI projection から非表示にし、memory.edit 成功後に response content を表示 text に反映し、failure では既存 projection を保持する。`GET /notes/:noteId` response の optional projection snapshot は Web が memory IDs を生成せず product state input に写す。browser deployment embedding adapter / browser app entry / browser ESM build artifact 後も Memory lifecycle policy は Web browser mount に入れない。wrangler config は static build artifact serving path と Worker-first API routes だけを所有する。deployment environment values の repo-tracked 直書き禁止 contract / guard は追加済み。 |
| 12 | Provenance Popover で source を確認できる | partial | Provenance lookup port / SQL read adapter、`POST /provenance/source` Worker route / runtime wiring、Web bounded popover view model、request descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver、app bootstrap、document-derived resolver options、product state composition、product app entrypoint、HTTP product provider、HTTP product app composition guard、repo-local hosted contract E2E は追加済み。browser runtime は `provenance.lookup` 成功 response body 由来の bounded excerpt / source metadata を provenance popover に反映して open にし、failure では既存 projection を保持する。`GET /notes/:noteId` response の optional projection snapshot は Web が provenance / sourceSpan IDs を生成せず product state input に写す。browser deployment embedding adapter / browser app entry / browser ESM build artifact 後も source lookup policy は Worker/runtime boundary に残る。wrangler config は static build artifact serving path と Worker-first API routes だけを所有する。deployment environment values の repo-tracked 直書き禁止 contract / guard は追加済み。 |
| 13 | AI provider failure が発生しても note editing は継続できる | partial | backend guard と web view model の failed AI status / editing action separation、browser editor save request path、API-free browser projection actions、failed save 時に editing projection を維持する browser runtime guard、repo-local hosted contract E2E は covered。残りは production-grade editor ergonomics。 |
| 14 | MVP 除外 UI / 連携が入っていない | partial | web view model に excluded-surface guard を追加済み。実 UI 実装時にも継続 guard が必要。 |
| 15 | Codex task、Superset workspace、docs contract の traceability が維持される | partial | contracts/records は維持。GitHub issue close/create と push は sandbox で未実行。 |

## Issue Drafts

### Issue: MVP canonical Note Model persistence for notes sections blocks

目的:
canonical `notes` / `sections` / `blocks` を Note Model 所有 boundary として保存・取得できるようにし、Agent-local save intent を canonical SoT と混同しない。

コンテキスト:
MVP acceptance #3 の blocking gap。`docs/contracts/data-model.md` と `docs/contracts/app-note-model.md` が SoT。AI runtime は canonical SoT を直接 mutate しない。

制約:
- repository interface は Note Model / runtime port として use-case need を表す。
- Turso adapter は infrastructure mapping のみを担当し、AI policy、scheduler policy、Operation Router policy を所有しない。
- AI structuring runtime から canonical Note/Section/Block write へ edge を作らない。
- Markdown string を内部 SoT にしない。

実装メモ:
- `NoteDocumentPersistencePort` または同等の Note Model-owned port を追加する。
- note load、block create/update/delete、section boundary persistence を分ける。
- H1/H2/H3 から sections を再構成する責務を Note Model boundary に閉じる。
- Turso SQL adapter は `notes` / `sections` / `blocks` のみを mapping する。

完了条件:
- blocks/sections が canonical model として保存・復元できる。
- invalid IDs、invalid heading levels、invalid block origins/types は永続化前に拒否される。
- AI runtime no-direct-SoT guard は通り続ける。

実装状況:
- `NoteDocumentPersistencePort`、in-memory port、Turso SQL adapter、focused contract tests は追加済み。
- Worker fetch entrypoint と default Turso executor wiring は追加済み。
- wrangler deployment config は追加済み。deployment environment values は Worker env/bindings、headers、runtime context、browser root dataset injection から供給し、`wrangler.toml` / public HTML に実値や placeholder/sentinel ID を直書きしない contract / guard を追加済み。Web UI から Worker endpoint への repo-local hosted contract E2E は追加済み。

検証コマンド:
- `node --test tests/contracts/note-model-runtime.test.mjs`
- `node --test tests/contracts/worker-no-direct-sot-mutation-guard.test.mjs`
- `node --test tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Issue: MVP Worker HTTP router and Cloudflare Agent wiring

目的:
`docs/contracts/api-events.md` の MVP route surface を Worker entrypoint と Agent wiring に接続する。

コンテキスト:
現在 `apps/worker/src` は runtime flow modules のみで、HTTP `fetch` entrypoint、auth/workspace normalization、Agent class wiring がない。

制約:
- HTTP route handler は normalization、auth/workspace context、runtime port wiring、response mapping だけを担当する。
- route handler は provider、Operation Router internals、Turso SQL details、product policy を所有しない。
- generated OpenAPI は projection であり SoT ではない。

実装メモ:
- MVP routes: note/block CRUD、note leave/manual/next_open/digest、operation accept/dismiss、memory accept/reject/edit/delete/hold。
- route-to-flow mapping tests を先に追加する。
- Cloudflare/Turso specific helpers は runtime adapter boundary の背後に置く。

完了条件:
- MVP route surface が Worker entrypoint で到達可能。
- invalid route input は ports を呼ばずに拒否される。
- route handlers が forbidden boundaries を import しない source guard がある。

実装状況:
- framework-neutral `workerHttpRouter` と route/delegation guard tests は追加済み。
- standard `Request` / `Response` の Worker fetch entrypoint、header based workspace/user normalization、JSON response mapping、default Turso / Agent-local executor wiring は追加済み。
- worker auth/workspace boundary は request header/env/context から stable workspace/user identity を正規化し、configured shared secret mismatch では port factory 前に止める。exact auth provider/JWT package は未固定。
- framework-neutral Cloudflare Agent binding foundation として NoteAgent / WorkspaceBrainAgent class、deployment binding descriptor、descriptor-derived Durable Object binding record、runtime flow delegation guard は追加済み。
- wrangler deployment config は追加済み。deployment environment values の repo-tracked 直書き禁止 contract / guard は追加済み。残りは hosted runtime env/binding injection の E2E 確認、exact production auth provider integration。

検証コマンド:
- `node --test tests/contracts/worker-*.test.mjs`
- `node --test tests/contracts/worker-auth-boundary.test.mjs tests/contracts/worker-entrypoint.test.mjs`
- `node --test tests/contracts/worker-cloudflare-agent-bindings.test.mjs tests/contracts/worker-note-structure-runtime-handlers.test.mjs tests/contracts/worker-structure-job-processor-flow.test.mjs`
- `node --test tests/contracts/topology-runtime.test.mjs`
- `node --test tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Issue: Preserve structure trigger reasons in runtime routes

目的:
`note_closed`、`tab_switched`、`app_left` を runtime/API で区別し、dirty section StructureJob の trigger reason を失わない。

コンテキスト:
scheduler domain は各 trigger を持つが、current Worker route input は `note_leave` に畳まれている。

制約:
- scheduler trigger policy は `contexts/scheduler` が所有する。
- runtime route は trigger reason を正規化して scheduler runtime flow に渡すだけ。
- keystroke AI call path を追加しない。

実装メモ:
- route input に leave cause を追加するか、明示 routes に分ける。
- `note_leave` 互換名を使う場合も internal trigger reason は保持する。
- docs/api-events の route/event wording と tests を同期する。

完了条件:
- note close / tab switch / app leave が別 trigger reason で StructureJob enqueue される。
- BlockChanged では AI work が作られない。

検証コマンド:
- `node --test tests/contracts/structure-scheduler-runtime.test.mjs`
- `node --test tests/contracts/worker-note-structure-runtime-handlers.test.mjs`
- `node --test tests/contracts/worker-structure-scheduler-flow.test.mjs`

### Issue: Next Open Digest read model and route

目的:
Next Open Digest を preparation intent だけでなく、read model と `GET /notes/:noteId/digest` で表示可能にする。

コンテキスト:
MVP acceptance #10。Agent-local digest preparation、read boundary、HTTP router delegation、Worker fetch Agent-local wiring、Web compact/expandable UI、browser response projection reducer は存在する。

制約:
- Digest は projection/read model であり canonical Note/Block SoT ではない。
- Context Assembly / memory / related unit data を full dump として返さない。
- Digest generation failure は note editing を止めない。

実装メモ:
- digest read port、Agent-local projection adapter、route handler、Web compact/expandable UI は追加済み。
- browser runtime は success response / caller supplied digest projection だけを UI projection に反映し、missing digest から fake content を作らない。

完了条件:
- `GET /notes/:noteId/digest` 相当の runtime flow が digest を返せる。
- missing digest は empty/available=false として安全に返る。
- provider/context failure が editing flow を止めない。

実装状況:
- `NextOpenDigestReadPort`、in-memory read port、Agent-local SQL read adapter、HTTP router delegation、Worker fetch wiring、Web compact/expandable view model / renderer / local expand-collapse、browser response projection reducer、focused contract tests は追加済み。
- 残りは hosted runtime env/binding injection の E2E と production editor ergonomics 側の表示 polish。

検証コマンド:
- `node --test tests/contracts/worker-structure-scheduler-flow.test.mjs`
- `node --test tests/contracts/worker-note-structure-runtime-handlers.test.mjs`
- `node --test tests/**/*.test.mjs`

### Issue: Memory review runtime boundary and persistence

目的:
Memory candidate の 覚える / 編集 / 違う / 削除 / 保留 actions を runtime port と persistence adapter で扱う。

コンテキスト:
MVP acceptance #11。`contexts/memory` の status transition、Worker API、Turso status update port、Web action mapping、browser response projection reducer は存在する。

制約:
- Memory は source-backed projection であり、hidden profiling にしない。
- source provenance を削除しない。
- rejected / archived memory は future context に入れない。
- Operation proposal accept/dismiss と memory lifecycle を混同しない。

実装メモ:
- `MemoryReviewPort`、in-memory port、Turso adapter、runtime handler を追加する。
- `create_memory_candidate` proposal から memory item への変換 boundary を明示する。
- edit action は content update と status `pending` を扱う。

完了条件:
- remember/edit/different/delete/hold が status transition として永続化される。
- source provenance が保持される。
- rejected/archived memory が Context Assembly に入らないことを runtime test で確認する。

実装状況:
- `MemoryReviewPort`、in-memory port、Turso SQL adapter、worker route compatible input/result、focused contract tests は追加済み。
- 覚える/違う/編集/削除/保留 は `memory_items` の status/content/review metadata update に限定され、source provenance は保持される。
- Web NoteSurface view model と API intent mapping に Memory Candidate action model は追加済み。
- `create_memory_candidate` proposal から memory item への変換 boundary は追加済み。accepted proposal intent から source-backed candidate write intent を作り、invalid primitive、workspace mismatch、source provenance のない item、non-memory operation では persistence port を呼ばない。
- Worker accept route と default Turso wiring は accepted `create_memory_candidate` proposal を memory candidate proposal boundary に接続済み。`insert_assist_block` accept では memory persistence を呼ばず、memory candidate preflight failure では proposal state を accepted に進めない。
- Browser runtime は memory review success response 由来で該当 memory candidate block を非表示にし、edit response/content 由来で candidate text projection を更新する。Memory lifecycle policy は Worker/runtime boundary に残す。
- 残りは production editor ergonomics 側の表示 polish。

検証コマンド:
- `node --test tests/contracts/worker-memory-review-port.test.mjs`
- `node --test tests/contracts/memory-runtime.test.mjs`
- `node --test tests/contracts/worker-context-assembly-memory-context-sql-adapter.test.mjs`
- `node --test tests/**/*.test.mjs`

### Issue: Provenance source lookup contract and runtime flow

目的:
AI Assist Block、memory candidate、operation audit の source span から、ユーザーが確認できる source excerpt を解決する。

コンテキスト:
MVP acceptance #12。source span data、read-only lookup boundary、Provenance Popover UI、Worker/Turso wiring、browser response projection reducer は存在する。

制約:
- lookup は scoped read model であり canonical data を mutate しない。
- source block excerpts は workspace/note/user boundary を越えて返してはならない。
- full note / full workspace dump を返さない。

実装メモ:
- provenance lookup contract、runtime port、SQL read adapter、UI popover は追加済み。
- operation audit source spans、memory source spans、AI block annotations の 3 経路を caller supplied mapping で扱う。
- UI popover は lookup success response の bounded excerpt / source metadata だけを反映する。

完了条件:
- valid source reference は bounded excerpt と reason を返す。
- invalid/mismatched workspace/note/source reference は拒否される。
- lookup source guard が write SQL を禁止する。

実装状況:
- `ProvenanceLookupPort`、in-memory port、Turso SQL read adapter、focused contract tests は追加済み。
- lookup は workspaceId/sourceSpanId/sourceBlockId/offsets を検証し、不正 input では query しない。
- Web NoteSurface view model に bounded Provenance Popover model は追加済み。
- Web API intent mapping は `POST /provenance/source` request descriptor を作れる。
- Browser runtime は provenance lookup success response を bounded excerpt / source metadata の popover UI projection として反映する。
- 残りは production editor ergonomics 側の表示 polish。

検証コマンド:
- `node --test tests/contracts/worker-provenance-lookup-port.test.mjs`
- `node --test tests/**/*.test.mjs`

### Issue: Web AppShell NoteSurface and Block Editor

目的:
ユーザーが一枚のノートに自然に書ける MVP UI を実装する。

コンテキスト:
MVP acceptance #1/#2/#13/#14。`apps/web` は docs のみで AppShell / Sidebar / TopBar / NoteSurface がない。

制約:
- single note surface を中心にする。
- contract #14 で除外された UI / 連携 surface を入れない。
- keystroke ごとの AI call をしない。
- frontend は note model semantics を所有しない。user intent events を発行する。

実装メモ:
- AppShell、Sidebar、TopBar、NoteSurface、Note Header、Block Editor を追加する。
- heading block H1/H2/H3 を section boundary として表示・編集できるようにする。
- saved / structuring / updated / failure status は控えめに表示する。
- provider failure state でも editing が継続できる component test を追加する。

完了条件:
- 1 ノートを編集できる UI がある。
- heading blocks を編集でき、section semantics に沿う。
- contract #14 excluded-surface guard がある。
- AI failure status が editing をブロックしない。

実装状況:
- dependency-free `apps/web/src/noteSurface.ts` view model と focused contract tests は追加済み。
- AppShell / Sidebar / TopBar / NoteSurface / NoteHeader / BlockEditor の single surface model、H1/H2/H3 section boundary、failed AI status でも editing action が残る guard、MVP excluded surface guard は検証済み。
- Note document validation は `contexts/note-model` の `validateNoteDocumentContract` が所有し、Web は validation result を消費する。
- 実 DOM/editor rendering、browser runtime、DOM host delegated click、explicit user save action から Worker `PATCH /blocks/:blockId` request descriptor / fetch-like transport への wiring は追加済み。Web は canonical Note / Section / Block を直接 mutate せず、save 時は marked contenteditable element の `textContent` だけを `{ noteId, content }` body に渡す。
- H1/H2/H3 heading save は既存 `block.update` intent を使う。Worker Note Model command boundary は既存 heading block を検出し、user-authored heading block text、owning section title、owning section contentHash を同じ loaded/saved NoteDocument で更新し、sectionId / headingBlockId / headingLevel mismatch を拒否する。non-heading text save でも owning section contentHash を更新し、lastStructuredHash は書き換えない。
- repo-local hosted contract E2E は追加済み。browser runtime は API-free UI actions (`expand_digest`, `collapse_digest`, `edit_block`, `cancel_edit`, `close_provenance`) を local projection state として反映し、injected host へ再描画する。save / AI / memory actions は既存 Worker request path を維持する。
- Browser runtime は successful `block.update` response 後に saved paragraph / heading text と heading section title を UI projection として更新し、editing state を idle に戻す。transport/controller failure では browser projection を更新せず、現在の editing state を保つ。
- 残りは production-grade editor ergonomics。

検証コマンド:
- `node --test tests/contracts/web-note-surface.test.mjs`
- `node --test tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`

### Issue: Web inline AI blocks memory digest and provenance UI

目的:
AI Assist Block、Memory Candidate Block、Next Open Digest、Provenance Popover を同じ NoteSurface 内に表示・操作できるようにする。

コンテキスト:
MVP acceptance #9/#10/#11/#12。backend/domain data は部分的にあるが、UI behavior がない。

制約:
- AI blocks は note 内 inline projection として扱い、user-authored blocks を直接 rewrite しない。
- AI Assist Block actions は 編集、採用、削除、なぜ？。
- Memory candidate actions は 覚える、編集、違う、削除、保留。
- Provenance Popover は source excerpt を表示し、full dump を表示しない。

実装メモ:
- AI block renderer、memory candidate renderer、digest component、provenance popover を追加する。
- action handlers は runtime API ports に接続できる形にする。
- writing flow を中断しない layout/state にする。

完了条件:
- AI Assist Block が同じ NoteSurface 内に表示される。
- Memory candidate を note 内で承認/拒否できる。
- Next Open Digest を compact/expandable に表示できる。
- source を Provenance Popover で確認できる。

実装状況:
- dependency-free NoteSurface view model に AI Assist Block action intents、Memory Candidate action intents、Next Open Digest compact/expandable model、bounded Provenance Popover model は追加済み。
- dependency-free API intent mapping に AI assist accept/dismiss、memory remember/reject/edit/delete/snooze、digest read、provenance lookup の Worker request descriptor は追加済み。memory.snooze は backend domain action の hold route に対応する。
- dependency-free API transport により request descriptor を injected fetch-like binding に送れる。Worker 実装、generated OpenAPI、provider、auth policy は import しない。
- framework-neutral HTML renderer により single note surface、block editor、inline AI blocks、memory candidates、next-open digest、provenance popover を escaped HTML と render event descriptors に変換できる。
- actions は provider call、hidden profiling、automatic active memory、user-authored block direct mutation を持たないことを contract test で検証済み。
- framework-neutral event controller は追加済み。renderer の event descriptor と caller supplied mapping から API intent input を組み立て、transport に渡す。invalid metadata では caller resolver / transport を呼ばず、transport failure は controller result に閉じる。
- framework-neutral browser runtime は追加済み。view model、HTML renderer、event controller、DOM 風 host adapter を接続し、escaped HTML mount、event binding、action dispatch、render/controller failure result を contract test で検証済み。
- browser runtime action response projection reducer は追加済み。`digest.read` / `provenance.lookup` / memory review 成功 response body 由来の UI projection だけを更新し、controller / transport failure では既存 projection を保持する。canonical Note / Section / Block SoT と Memory lifecycle policy は Web runtime に持ち込まない。
- DOM host adapter は追加済み。実 DOM API はこの adapter に閉じ、root HTML 差し替え、delegated click binding、render event descriptor による dataset 補完、listener replacement を contract test で検証済み。
- action input resolver は追加済み。operationId / memoryId / noteId / provenance / memory edit content は caller supplied lookup から取得し、ID 生成、backend policy validation、transport ownership を持たないことを contract test で検証済み。
- app bootstrap は追加済み。caller supplied note document、DOM root、fetch-like binding、workspace/user metadata、resolver lookup から view model、transport、resolver、controller、DOM host、browser runtime を組み立て、invalid options では root binding / fetch-like call 前に止める。
- Web integration source guard は追加済み。`apps/web/src/noteSurface*.ts` を横断し、DOM API 所有を DOM host に限定し、Worker/generated/provider/global fetch/direct mutation/MVP excluded side surface を guard する。
- document-derived resolver options は追加済み。AI blocks / memory candidate blocks / complete source annotations と caller supplied projection ID maps を照合し、operationId / memoryId / sourceSpanId を生成せず action input resolver options を作る。
- product state composition は追加済み。caller supplied Note document、view state、projection ID maps から App bootstrap 用の document / viewOptions / resolverOptions だけを合成し、view model / runtime / transport / DOM host / backend policy は所有しない。invalid Note document は bootstrap 前に boundary result として返す。
- product app entrypoint は追加済み。caller supplied product provider snapshot を product state composition に渡し、App bootstrap mount に接続するだけに留める。provider failure、invalid product state、bootstrap invalid options は root binding / fetch-like call 前の boundary result として返す。
- HTTP product provider は追加済み。caller supplied fetch-like binding で `GET /notes/:noteId` の initial note snapshot を読み、optional `viewState` / `projectionMaps` が response にある場合は response/caller supplied snapshot として product state input に写す。write routes、Worker internals、generated projection、provider SDK、global fetch、DOM、ID generation、canonical Note / Section / Block direct mutation は所有しない。
- HTTP product provider projection snapshot mapping は provider focused test と product state / product app tests で検証する。Web は operation / memory / provenance / sourceSpan IDs を生成せず、response/caller supplied snapshot を渡すだけに留める。
- HTTP digest product provider boundary は登録済み。note snapshot provider の response/caller supplied `nextOpenDigest` を read projection として viewState に渡すだけに留め、digest items の推測変換、SoT mutation、ID generation、AI/provider call、global fetch、DOM/framework/deployment config は所有しない。
- HTTP product app composition guard は追加済み。HTTP product provider と Product App entrypoint の接続だけを許可し、global fetch、DOM query、framework runtime、deployment config、provider SDK、ID generation、canonical Note / Section / Block direct mutation を所有しない。
- browser deployment embedding adapter は `browserNoteSurfaceMount.ts` に閉じる責務として記録する。global `document` / `fetch`、mount target lookup、deployment-supplied metadata extraction を薄く所有し、Product App entrypoint / HTTP product app composition / app bootstrap に caller supplied root / fetch-like binding / mount options を渡すだけに留める。root dataset の `data-api-base-url`、`data-workspace-id`、`data-note-id`、optional `data-user-id`、`data-workspace-name`、`data-expanded-digest`、`data-view-state-json`、`data-projection-maps-json` は deployment adapter の volatile detail であり、NoteSurface application boundary や domain policy ではない。NoteSurface application boundary、domain policy、ID generation、Worker internals、generated OpenAPI、provider SDK、auth policy、canonical Note / Section / Block direct mutation は所有しない。
- browser deployment embedding adapter は `data-projection-maps-json` を response/caller supplied projection ID maps として Product state composition に渡すだけに留める。Web は operation / memory / provenance / sourceSpan / note / block IDs を生成、補完、推測せず、invalid JSON や missing entry から fallback mapping を作らない。
- 既存 Web integration source guard は `noteSurface*.ts` の application boundary guard として維持する。browser deployment embedding adapter guard は別責務として、browser global / DOM query / deployment detail が application files に戻らないことを確認する。
- browser app entry deployment bootstrap は `browserNoteSurfaceAppEntry.ts` に閉じる責務として記録する。import-time side effect を持たず、deployment descriptor / injected runtime で mount adapter を起動するだけに留める。NoteSurface application boundary、domain policy、framework package selection、bundler/build artifact serving、deployment config、provider SDK、auth policy、ID generation、canonical Note / Section / Block direct mutation は所有しない。
- browser static build artifact path は追加済み。`npm run build:web` は external dependency を増やさず `apps/web/public` を `dist/web` にコピーし、TypeScript browser ESM を `dist/web/assets` に emit し、root `noEmit` typecheck semantics は維持する。`apps/web/public/index.html` は compiled `browserNoteSurfaceAppEntry.js` を import して `startBrowserNoteSurfaceApp` を明示実行する deployment template であり、required dataset metadata は deployment が埋める。
- wrangler deployment config は `main = "apps/worker/src/workerEntrypoint.ts"`、`[assets].directory = "./dist/web"`、Worker-first API route patterns を固定する volatile deployment detail として追加済み。deployment environment values は `docs/contracts/backend-runtime.md` / `docs/contracts/cloudflare-agents-turso.md` に追記し、`tests/contracts/deployment-environment-values.test.mjs` で `wrangler.toml`、public HTML、browser dataset keys、Worker env interface を guard する。browser deployment embedding adapter、browser app entry deployment bootstrap、browser static build artifact path 後の hosted page から Worker endpoint への repo-local contract E2E は `tests/contracts/hosted-note-surface-e2e.test.mjs` で追加済み。

検証コマンド:
- `node --test tests/contracts/web-note-surface.test.mjs`
- `node --test tests/contracts/web-note-surface-api-intents.test.mjs tests/contracts/web-note-surface.test.mjs`
- `node --test tests/contracts/web-note-surface-http-product-provider.test.mjs tests/contracts/web-note-surface-product-state.test.mjs tests/contracts/web-note-surface-product-app.test.mjs`
- `node --test tests/contracts/web-browser-note-surface-mount.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- `node --test tests/contracts/web-browser-note-surface-app-entry.test.mjs tests/contracts/web-browser-note-surface-mount.test.mjs tests/contracts/web-note-surface-integration-guard.test.mjs`
- `node --test tests/contracts/hosted-note-surface-e2e.test.mjs`
- `npm run build:web`
- `node --test tests/contracts/web-browser-static-build.test.mjs`
- `node --test tests/contracts/deployment-environment-values.test.mjs`
- `node --test tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`

## Suggested Implementation Order

1. Production-grade editor ergonomics: dirty/error/success display、retry、カーソル維持、layout stability。
2. Hosted runtime env/binding injection E2E。
3. Exact production auth provider integration。
4. GitHub issue close/create と push による traceability projection 更新。

## Review Notes

- MVP complete は未宣言。repo-local hosted E2E と deployment environment values の repo-tracked 直書き禁止は contract / focused guard として固定済み。
- DDD 境界上、次の backend slice は deployment/auth integration と product/domain policy を混ぜない。
- UI slice は production editor ergonomics に絞り、canonical Note / Section / Block SoT と Memory lifecycle policy を Web runtime に移さない。
- GitHub issue close/create と push は sandbox policy により未実行。
