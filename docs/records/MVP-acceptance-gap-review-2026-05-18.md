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
| 1 | ユーザーが一枚のノートに自然に書ける | partial | dependency-free AppShell / NoteSurface / Block Editor view model は追加済み。実 DOM/editor rendering は未実装。 |
| 2 | H1/H2/H3 が section boundary として扱われる | partial | note-model document validation と web NoteSurface view model で heading boundary は検証済み。実 editor rendering/editing は未実装。 |
| 3 | blocks と sections が内部正本として保存される | partial | canonical Note document persistence port / SQL adapter、block CRUD command port、HTTP router delegation、Worker fetch default Turso wiring、auth/workspace boundary、Cloudflare Agent binding foundation は追加済み。concrete Cloudflare deployment values と end-to-end UI wiring は未実装。Agent-local save intent は canonical SoT ではない。 |
| 4 | note close / tab switch / app leave で dirty section の structure job が作られる | partial | scheduler domain、worker route handler cause preservation、HTTP router delegation、Worker fetch entrypoint、framework-neutral NoteAgent binding foundation は対応済み。concrete Cloudflare SDK/deployment config は未実装。 |
| 5 | keystroke ごとに AI が呼ばれない | covered | BlockChanged は save/edit/dirty/index のみで provider/router/audit に進まない。 |
| 6 | Context Assembly が title、description、target section、related units、memory を使う | covered | ContextEnvelope contract と worker runtime flow で検証済み。 |
| 7 | AI は operation schema に従って返す | covered | operation list、allowed/forbidden types、source spans、confidence を contract/test で検証済み。 |
| 8 | Operation Router が unsafe operation を reject する | covered | unknown/forbidden operations、unsafe targets、low confidence、invalid audit IDs を reject。 |
| 9 | AI Assist Block が同じノート内に表示される | partial | Web NoteSurface view model、inline AI Assist action intents、Worker request descriptor mapping、fetch-like transport、framework-neutral HTML renderer、event controller、browser runtime、DOM host、action input resolver は追加済み。実 app bootstrap / state composition は未実装。 |
| 10 | Next Open Digest が表示できる | partial | digest preparation、read boundary、HTTP router delegation、Worker fetch Agent-local wiring、Web compact/expandable view model、digest GET descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver は追加済み。実 app bootstrap / state composition は未実装。 |
| 11 | Memory candidate をノート内で承認または拒否できる | partial | Memory review port / SQL adapter / HTTP router / Worker fetch wiring、`create_memory_candidate` proposal 変換 boundary、Worker accept route/default Turso wiring、Web Memory Candidate action model、remember/edit/different/delete/hold descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver は追加済み。実 app bootstrap / state composition は未実装。 |
| 12 | Provenance Popover で source を確認できる | partial | Provenance lookup port / SQL read adapter、`POST /provenance/source` Worker route / runtime wiring、Web bounded popover view model、request descriptor mapping、fetch-like transport、HTML renderer、event controller、browser runtime、DOM host、action input resolver は追加済み。operation/memory/AI annotation からの product-level mapping と実 app bootstrap は未実装。 |
| 13 | AI provider failure が発生しても note editing は継続できる | partial | backend guard と web view model の failed AI status / editing action separation は covered。実 editor UX は未実装。 |
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
- 残りは実 Cloudflare deployment config と Web UI からの end-to-end wiring。

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
- framework-neutral Cloudflare Agent binding foundation として NoteAgent / WorkspaceBrainAgent class、deployment binding descriptor、runtime flow delegation guard は追加済み。
- 残りは concrete Cloudflare SDK/wrangler deployment values と exact production auth provider integration。

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
MVP acceptance #10。Agent-local digest preparation、read boundary、HTTP router delegation は存在するが、real Worker/Turso wiring と UI integration がない。

制約:
- Digest は projection/read model であり canonical Note/Block SoT ではない。
- Context Assembly / memory / related unit data を full dump として返さない。
- Digest generation failure は note editing を止めない。

実装メモ:
- digest read port、Agent-local or Turso projection adapter、route handler を追加する。
- compact/expandable UI は別 UI issue に接続する。

完了条件:
- `GET /notes/:noteId/digest` 相当の runtime flow が digest を返せる。
- missing digest は empty/available=false として安全に返る。
- provider/context failure が editing flow を止めない。

実装状況:
- `NextOpenDigestReadPort`、in-memory read port、Agent-local SQL read adapter、HTTP router delegation、focused contract tests は追加済み。
- 残りは real Worker/Turso binding と compact/expandable UI。

検証コマンド:
- `node --test tests/contracts/worker-structure-scheduler-flow.test.mjs`
- `node --test tests/contracts/worker-note-structure-runtime-handlers.test.mjs`
- `node --test tests/**/*.test.mjs`

### Issue: Memory review runtime boundary and persistence

目的:
Memory candidate の 覚える / 編集 / 違う / 削除 / 保留 actions を runtime port と persistence adapter で扱う。

コンテキスト:
MVP acceptance #11。`contexts/memory` の status transition はあるが、Worker API と Turso status update port がない。

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
- 残りは full editor integration。

検証コマンド:
- `node --test tests/contracts/worker-memory-review-port.test.mjs`
- `node --test tests/contracts/memory-runtime.test.mjs`
- `node --test tests/contracts/worker-context-assembly-memory-context-sql-adapter.test.mjs`
- `node --test tests/**/*.test.mjs`

### Issue: Provenance source lookup contract and runtime flow

目的:
AI Assist Block、memory candidate、operation audit の source span から、ユーザーが確認できる source excerpt を解決する。

コンテキスト:
MVP acceptance #12。source span data と read-only lookup boundary は存在するが、Provenance Popover UI と real Worker/Turso wiring がない。

制約:
- lookup は scoped read model であり canonical data を mutate しない。
- source block excerpts は workspace/note/user boundary を越えて返してはならない。
- full note / full workspace dump を返さない。

実装メモ:
- provenance lookup contract、runtime port、SQL read adapter を追加する。
- operation audit source spans、memory source spans、AI block annotations の 3 経路を扱う。
- UI popover は別 UI issue でこの flow を読む。

完了条件:
- valid source reference は bounded excerpt と reason を返す。
- invalid/mismatched workspace/note/source reference は拒否される。
- lookup source guard が write SQL を禁止する。

実装状況:
- `ProvenanceLookupPort`、in-memory port、Turso SQL read adapter、focused contract tests は追加済み。
- lookup は workspaceId/sourceSpanId/sourceBlockId/offsets を検証し、不正 input では query しない。
- Web NoteSurface view model に bounded Provenance Popover model は追加済み。
- Web API intent mapping は `POST /provenance/source` request descriptor を作れる。
- 残りは operation audit / memory / AI block annotation からの caller wiring、full editor integration。

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
- 残りは実 DOM/editor rendering、browser interaction、Worker API integration。

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
- DOM host adapter は追加済み。実 DOM API はこの adapter に閉じ、root HTML 差し替え、delegated click binding、render event descriptor による dataset 補完、listener replacement を contract test で検証済み。
- action input resolver は追加済み。operationId / memoryId / noteId / provenance / memory edit content は caller supplied lookup から取得し、ID 生成、backend policy validation、transport ownership を持たないことを contract test で検証済み。
- 残りは実 app bootstrap / state composition と product-level mapping。

検証コマンド:
- `node --test tests/contracts/web-note-surface.test.mjs`
- `node --test tests/contracts/web-note-surface-api-intents.test.mjs tests/contracts/web-note-surface.test.mjs`
- `node --test tests/**/*.test.mjs`
- `tsc -p tsconfig.json --noEmit`

## Suggested Implementation Order

1. Note Model canonical persistence
2. Worker HTTP router / Agent wiring
3. Trigger reason preservation
4. Next Open Digest read route
5. Memory review runtime
6. Provenance lookup runtime
7. Web AppShell / NoteSurface / Block Editor
8. Web inline AI blocks / memory / digest / provenance UI

## Review Notes

- MVP complete は未宣言。blocking gap が残っている。
- DDD 境界上、次の backend slice は Note Model SoT persistence と Memory/Provenance runtime を混ぜない。
- UI slice は `apps/web` がまだ実装なしのため、最初に shell/editor、次に AI projections UI に分ける。
- GitHub issue close/create と push は sandbox policy により未実行。
