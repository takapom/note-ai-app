# バックエンドランタイム契約

ドキュメント種別: contract  
権威: backend responsibility boundaries の信頼できる唯一の情報源  
オーナー: runtime オーナー  
付随契約: cloudflare-agents-turso.md, vendor-lock-avoidance.md, api-events.md, data-model.md  
生成済み companion: apps/worker/docs/runtime-contract.md  
検証レーン: runtime topology レビューレーン  
ステータス: active

## 目的

product ownership を runtime code に漏らさず、Worker/API/Agent の責務を定義する。

## この契約が所有するもの


- Worker の責務。
- Runtime adapter boundaries。
- API routing の期待値。
- UI/backend event flow。
- runtime は product semantics を所有しないというルール。


## この契約が所有しないもの


- Note model semantics。
- UI policy。
- AI 操作スキーマ。


## 不変条件


- Worker は HTTP、auth、routing、Turso access、Agent routing、AI SDK provider setup を扱う。
- Worker は contexts/contracts に属する product decisions を直接実装しない。
- Runtime modules は ad-hoc parsing ではなく context contracts と operation router を呼び出す。
- Runtime は `api-events.md` の event flow を実装し、UI event から AI provider または Turso への直接ショートカットを作らない。
- Runtime worker HTTP router は MVP API surface の method/path matching、path parameter extraction、auth/workspace context passing、handler delegation、response mapping だけを担当する。scheduler policy、Note Model policy、memory policy、Operation Router policy、provider calls、SQL details を所有しない。
- Worker fetch entrypoint は standard `Request` / `Response` の parsing、deployment-owned auth verifier seam、workspace/user context normalization、JSON body parsing、runtime port factory wiring、worker HTTP router delegation、HTTP JSON response mapping だけを担当する。Cloudflare package type、auth provider SDK、JWT validation package、Operation Router internals、product policy、generated OpenAPI、SQL statement details を import または所有してはならない。
- Worker fetch entrypoint may serve the deployment-only `GET /__ann/bootstrap` metadata route before product router delegation. This route returns browser mount metadata from normalized runtime identity plus deployment-supplied or URL-supplied note id, must not create runtime ports, and must not read Turso, Agent-local SQL, provider, Operation Router, or generated OpenAPI details.
- Worker default runtime port wiring module は deployment-supplied Turso / Agent-local SQL bindings から runtime ports を組み立てる infrastructure composition boundary である。HTTP parsing、auth policy、product policy、Operation Router policy、provider calls を所有してはならない。
- Worker default runtime port wiring module may choose a note structure route dispatcher backed by the `NOTE_AGENT` Durable Object namespace when that binding is available. `WorkerHttpRouter` must continue to depend only on the route-level port and must not import Cloudflare namespace, stub, or Durable Object details.
- Worker default runtime port wiring module は WorkspaceBrainAgent の StructureJob processor options も deployment-supplied Turso / Agent-local SQL bindings、provider registry、Operation Router snapshot から組み立てる。provider registry と snapshot は deployment/runtime supplied dependency であり、Worker port wiring module は provider SDK や Operation Router policy を所有しない。
- Worker fetch entrypoint owns the local-only WorkspaceBrain process trigger path `/__local/agents/workspace/process` as a verification surface, not an MVP product route. It must require `LOCAL_AGENT_SMOKE_ENABLED=1`, pass normal auth/workspace normalization first, require a userId, call the `WORKSPACE_BRAIN_AGENT` Durable Object namespace through the RPC boundary, and avoid `WorkerHttpRouter` / product route registration.
- Worker fetch entrypoint は invalid JSON、missing workspaceId、invalid route / method mismatch では runtime port factory を呼ばずに response しなければならない。
- Worker auth/workspace boundary は request header、env、runtime context、または injected deployment-owned verifier から渡された verified identity を workspaceId と任意の userId の stable non-sentinel runtime id として正規化する薄い runtime boundary である。auth provider、JWT validation package、product authorization policy、workspace membership policy、SQL、Operation Router、provider calls を所有してはならない。configured shared secret がある場合は framework-neutral な boundary descriptor として request secret と照合してよいが、exact auth product を固定してはならない。production deployment の exact vendor / token verification は repo-owned code ではなく injected verifier が所有する。
- Worker fetch entrypoint は Worker auth/workspace boundary または injected verifier が invalid workspaceId、invalid optional userId、configured shared secret mismatch、invalid credentials / failure を返した場合、runtime port factory、router delegation、Turso、Agent、provider、Operation Router を呼ばずに response しなければならない。
- Deployment environment values は deployment が供給する volatile runtime detail である。Turso client bindings、Agent-local SQL client bindings、workspaceId、任意の userId、noteId、Worker auth shared secret は Worker `env`、request headers、URL query、または injected runtime context から渡し、`wrangler.toml`、public HTML、generated docs、application source に実値または placeholder/sentinel ID として直書きしてはならない。
- `wrangler.toml` は Cloudflare deployment entrypoint、compatibility date、static asset directory、Worker-first route patterns、NoteAgent / WorkspaceBrainAgent Durable Object binding descriptor、migration class list だけを接続する deployment descriptor である。`[vars]` / secrets section、Turso URL/token、auth/shared secret、workspace/user identity を持たせてはならない。
- Browser deployment page は deployment template であり、required/optional metadata は hosted deployment が `GET /__ann/bootstrap` または root dataset の `data-api-base-url`、`data-workspace-id`、`data-note-id`、任意の `data-user-id` で供給する。repo 内の public HTML は required metadata の説明と mount root と deployment bootstrap call だけを持ち、実値、example tenant ID、placeholder、sentinel を属性値として持ってはならない。
- ローカル検証では runtime values を shell env、test harness、または deployment platform の secret/binding mechanism から注入する。hosted E2E では deployed page の root dataset と Worker env/bindings が runtime によって供給されることを確認し、repo-tracked config に値を戻さない。
- Local Cloudflare runtime smoke is an explicit optional lane outside `npm run verify`. It may launch `wrangler dev` or target `WORKER_LOCAL_URL`, but unavailable Wrangler, missing local operator values, missing seed data, or missing local Durable Object bindings must be reported as setup/blocker failures rather than silent skips.
- Runtime は note leave、manual organize、next open の API を scheduler/Agents にルーティングする。
- Runtime note structure route handler は route/event normalization、auth/workspace context、runtime port wiring、scheduler runtime flow 呼び出し、response mapping だけを担当し、provider、Operation Router、audit persistence、canonical Note/Section/Block write を所有しない。
- Worker default runtime port wiring module may dispatch StructureJobs scheduled by NoteAgent into the workspace-scoped `WORKSPACE_BRAIN_AGENT` Durable Object queue through an explicit RPC boundary when both bindings and a request `userId` are available. This dispatch is a named background handoff only: it must not call provider, Operation Router, audit persistence, projection persistence, or canonical Note/Section/Block write paths, and dispatch failure must be reported separately without rewriting the scheduler decision.
- Runtime StructureJob Agent handler は context assembly runtime flow を先に呼び、valid ContextEnvelopeBuilt の場合だけ structure job operation orchestration flow に接続する。invalid context assembly では provider、Operation Router、audit persistence、canonical Note/Block write に到達してはならない。
- Runtime StructureJob work queue port は queued StructureJob の claim と running/completed/failed lifecycle transition だけを扱う application/runtime port である。blank IDs、NaN timestamp、不正 status を valid result として返してはならず、provider、Operation Router、audit persistence、canonical Note/Block write、SQL adapter details を所有しない。
- StructureJob work queue Agent-local SQL adapter は `StructureJobWorkQueuePort` を実装し、`agent_local_structure_jobs` の queued/running/completed/failed temporary state transition だけを扱う。canonical notes / sections / blocks、provider、Operation Router、audit persistence、projection persistence を更新してはならない。
- Runtime StructureJob processor flow は `StructureJobWorkQueuePort.claimNextQueuedJob` を最初に呼び、claimed running job だけを StructureJob Agent handler に渡す。queued job がない場合は no-op として provider、context assembly、Operation Router、audit persistence、complete/fail transition へ進んではならない。
- Runtime StructureJob processor flow は Agent handler が success を返した場合だけ `markJobCompleted` を呼び、completedAt は provider generation flow の completed StructureJob response を使う。context assembly failure、provider failure、invalid generation runtime input、routing failure、audit failure は `markJobFailed` に渡し、routing/audit downstream failure では orchestration result を保持しなければならない。
- WorkspaceBrainAgent Durable Object adapter は public RPC command を serializable `workspaceId` / `userId` / `now` processor DTO、または serializable `workspaceId` / `userId` / `now` / queued StructureJob DTO enqueue command に限定し、processor port objects を public command として受け取ってはならない。enqueue RPC が queued StructureJob を受理した場合は Durable Object alarm を予約して background processor を起こしてよい。alarm は保存済みの serializable process command を読み、1 wake で `processNextQueuedStructureJob` を 1 回だけ呼び、`completed` または terminal `agent_failed` の後だけ次 alarm を予約する。runtime processor options は Worker port wiring module から作り、missing binding / options provider failure は stable `workspace brain processor ports are not configured` 系の意味として返し、SQL、Turso、provider、auth、token/secret detail を public RPC result に漏らしてはならない。
- Runtime scheduler flow は scheduler contract が返す BlockChanged save/edit/dirty/index output と StructureJob plan を port に渡すだけであり、trigger semantics、context_hash dedupe、whole-note eligibility を再実装してはならない。
- Runtime scheduler flow は invalid scheduler input を persistence port、provider、Operation Router、audit persistence へ流してはならない。
- Scheduler Agent-local SQL adapter は scheduler runtime ports の infrastructure implementation であり、Agent-local temporary state への statement mapping と executor/query failure reporting のみを担当する。canonical Note Model persistence、provider calls、Operation Router、audit persistence を所有しない。
- Runtime Note document persistence port は Note Model-owned canonical `notes` / `sections` / `blocks` の save/load boundary であり、Note/Section/Block contract validation と infrastructure error reporting だけを扱う。AI policy、scheduler trigger policy、Context Assembly retrieval policy、Operation Router、provider calls、projection persistence を所有しない。
- Turso Note document persistence adapter は runtime Note document persistence port の infrastructure implementation であり、canonical `notes` / `sections` / `blocks` への ordered SQL statement mapping と row restoration だけを担当する。Agent-local SQL、semantic unit projections、memory items、operation audit、source spans を write してはならない。
- Runtime Note block command port は Note document persistence port の load/save を通じて canonical Block create/update/delete command を扱う。browser editor からの text create では frontend が Block ID を生成せず、runtime command boundary が stable Block ID と user-authored paragraph block を作る。Note Model validation と document-level reference validation だけを行い、scheduler policy、AI policy、Context Assembly、Operation Router、audit、memory、projection writes を所有しない。
- Turso Scheduler Note Snapshot adapter は `SchedulerNoteSnapshotPort` を実装し、Turso の canonical `sections` を `SectionContract` に mapping する。任意で Agent-local dirty marks を overlay してよいが、canonical Note/Section/Block data の write、scheduler policy の再計算、provider calls、Operation Router、audit persistence を所有しない。
- Runtime context assembly flow は StructureJob target、workspaceId、userId、retrieval port output を Context Assembly contract に渡し、valid ContextEnvelope からのみ user-specific な `ContextEnvelopeBuilt` を返す。retrieval order、K limits、context budget、trust boundary を再実装してはならない。
- Runtime context assembly flow は target snapshot の scope が StructureJob target scope と一致しない場合、local / related / memory retrieval や ContextEnvelope assembly へ進んではならない。
- Context Assembly retrieval ports は read-only application/runtime ports であり、canonical note/section/block snapshots、semantic unit projections、memory projections の取得だけを担当する。canonical Note/Block write、memory status transition、provider calls、Operation Router、audit persistence を所有しない。
- Runtime Next Open Digest read port は prepared digest projection を read-only で返す。missing digest は fake content を作らず `available: false` として返し、provider、Operation Router、audit、memory activation、Context Assembly を呼び出してはならない。
- Runtime Provenance Lookup port は Provenance Popover 用の source lookup read model を read-only で返す。lookup は workspaceId、sourceSpanId、sourceBlockId、finite offsets で境界付け、source_spans / ai_operations の source reference と canonical block source を read-only で照合する。invalid primitive では query へ進まず、returned model は bounded excerpt と source metadata に限る。provider、Operation Router、audit write、memory activation、canonical Note/Section/Block write、full note / full workspace dump を行ってはならない。
- Runtime Memory Review port は `POST /memory/:memoryId/accept`、`POST /memory/:memoryId/reject`、`POST /memory/:memoryId/edit`、`POST /memory/:memoryId/delete`、`POST /memory/:memoryId/hold` の delegated boundary であり、workspaceId、userId、memoryId、now、edit content を検証してから source-backed `memory_items` candidate/pending status、edit content、review metadata だけを更新する。invalid primitive や invalid edit content では persistence に触れてはならず、source provenance、canonical Note/Section/Block、provider、Operation Router、Context Assembly、audit persistence を変更または呼び出してはならない。
- Runtime Operation Proposal SQL adapter は `operation_proposals` の pending/accepted/dismissed state と proposal audit record JSON の保存/復元だけを担当する。Operation Router policy の再分類、provider、audit write path、projection apply、canonical Note/Section/Block write を所有してはならない。
- Runtime Memory Candidate Proposal boundary は accepted operation proposal intent を受け取り、`create_memory_candidate` の場合だけ source-backed `MemoryItemContract` candidate/pending write intent を `MemoryCandidatePersistencePort` に渡す。Worker HTTP accept route は `approvedIntent` が返った後にこの boundary を明示的に orchestrate してよいが、operation proposal accept/dismiss handler 自体は `memory_items` を write してはならない。Turso default wiring は `mapMemoryCandidateWriteIntentToSql` の `memory_items` insert だけを実行し、invalid primitive、workspace mismatch、non-`create_memory_candidate`、source provenance のない memory item では persistence port を呼ばず、canonical Note/Section/Block、provider、Operation Router、Context Assembly、audit persistence を呼び出してはならない。
- Turso Context Assembly Target Snapshot adapter は `ContextAssemblyTargetSnapshotPort` を実装し、Turso の canonical `notes`、`sections`、`blocks` を read-only で Context Assembly input candidate へ mapping する。`description_effective` priority、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Local Structure adapter は `ContextAssemblyLocalStructurePort` を実装し、semantic unit projections、section summary projections、previous structure snapshot projections を read-only で Context Assembly input candidate へ mapping する。retrieval order、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Related Context adapter は `ContextAssemblyRelatedContextRetrievalPort` を実装し、related semantic unit projections と explicit candidate relation から canonical note card / block excerpt を read-only で Context Assembly input candidate へ mapping する。full note / full workspace dump、retrieval policy、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Turso Context Assembly Memory Context adapter は `ContextAssemblyMemoryRetrievalPort` を実装し、`memory_context_candidates` と canonical `memory_items` を read-only で Context Assembly input candidate へ mapping する。candidate projection と canonical memory item の両方を workspaceId と userId で境界付け、returned memoryContext item に workspaceId/userId を含めてはならない。memory eligibility の最終 active/pinned filtering、K limits、context budget、trust boundary、provider calls、Operation Router、audit persistence を所有しない。
- Runtime operation generation provider flow は valid `ContextEnvelopeBuilt` event、valid ContextEnvelope、running StructureJob だけを provider registry boundary に渡す。Context Assembly の budget / K / trust boundary は再実装せず、provider success の場合だけ completed StructureJob response と provider-independent operations payload を返す。
- Operation generation provider flow は provider SDK import、operation schema/policy validation、Operation Router 呼び出し、audit persistence、canonical Note/Block write を所有しない。provider failure、provider unavailable、invalid runtime input、invalid ContextEnvelope では completed StructureJob response を返さず、Operation Router に到達してはならない。
- Runtime structure job operation orchestration flow は provider generation flow の `completedStructureJobResponse` だけを `structureJobOperationFlow` に渡す。`completedStructureJobResponse.aiResponse` が downstream の Operation Router input になる。
- Runtime structure job operation orchestration flow は provider failure、provider unavailable、invalid generation runtime input、invalid ContextEnvelope では `structureJobOperationFlow` を呼び出さず、Operation Router / audit persistence / Note/Block source of truth に到達してはならない。
- Runtime orchestration boundary は completed StructureJob の AI response だけを operation routing に渡す。non-completed job と provider failure は Note/Block source of truth を変更せず、Operation Router を呼び出さない。
- Runtime は AI response に stable operation audit IDs を付与し、Operation Router を経由してから audit persistence port へ渡す。
- Runtime persistence port は Operation Router の policy/status を再分類せず、storage shape validation と infrastructure error handling のみを担当する。
- Audit persistence failure は routing result と分離され、apply/propose/reject/no_apply decision を書き換えてはならない。
- Runtime operation audit recovery queue は audit persistence failure を retry/recovery 対象として記録する application/runtime port である。queue payload は stable operationId、workspaceId、任意の noteId/structureJobId、元の audit record、failure message、failedAt を保持し、policy/status を再分類してはならない。
- Runtime operation audit recovery queue は retry、transaction、Turso executor 呼び出しを実行しない。retry processor や Agent-local SQL adapter は別の明示的な boundary として追加する。
- Agent-local operation audit recovery queue adapter は recovery intent を `agent_local_operation_audit_recovery_queue` temporary table に保存する infrastructure adapter である。retry、transaction、canonical `ai_operations` / `source_spans` write、operation policy/status 再分類を行ってはならない。
- Runtime audit/projection/proposal persistence failure は public/runtime-facing result では stable failure meaning に正規化する。SQL、Turso/libSQL、provider SDK、auth provider、token/secret など volatile detail を response body や domain policy に漏らしてはならない。validation failure は caller が修正できる意味を保つ。
- Runtime operation projection persistence flow は Operation Router の route result を入力に取り、`apply` action の silent projection effects だけを active projection persistence port へ渡す。`propose` action は operation proposal persistence boundary に渡し、`reject` / `no_apply` は projection write を行わない。
- Operation projection persistence port は routing済み audit record と apply result から作られた write intent だけを保存し、operation schema validation、policy classification、provider call、canonical Note/Section/Block write を所有しない。
- UI event から Worker route handler、StructureJob processor、Context Assembly、provider generation、Operation Router、projection/proposal persistence に至る AI structuring runtime path は、canonical Note / Section / Block source of truth を直接 mutate してはならない。許可される write は StructureJob temporary state、operation audit、active projection、proposal/review boundary であり、user-authored block の変更は明示的な user action または別の Note Model 所有 boundary だけが扱う。
- Provider failure、provider unavailable、invalid generation runtime input、invalid ContextEnvelope、context retrieval failure は projection/proposal persistence に到達してはならず、canonical Note / Section / Block source of truth を変更してはならない。
- Turso operation audit executor は runtime persistence port の下に置かれる薄い infrastructure executor であり、Turso/libSQL-like client interface に SQL statements を投入するだけである。
- Turso operation audit executor は渡された SQL statement order を保持しなければならない。batching、retry、transaction wrapper を導入する場合も、観測される execution order を変更してはならない。
- Turso operation audit executor は empty statement list を拒否する。これは no-op success ではなく caller misuse / infrastructure failure として扱う。
- Turso operation audit executor は途中 failure を捕捉して policy/status へ変換せず、infrastructure failure として上位へ伝播する。
- 現在の Turso operation audit executor は非トランザクショナルな ordered sequential executor であり、途中 failure 時の partial write 可能性を隠してはならない。all-or-nothing が必要な場合は、runtime persistence/recovery boundary の contract と test を更新してから明示的な transaction/batch adapter として追加する。
- Turso operation audit executor は operation schema、policy classification、routing status を参照しない。これらは Operation Router と audit persistence adapter の責務である。


## 許可されるトポロジー

Web client -> Worker API -> note structure route handler -> NoteAgent scheduler runtime flow -> StructureJob queue -> explicit WorkspaceBrainAgent queue dispatch -> structure job processor flow -> StructureJob work queue port -> StructureJob Agent handler -> context assembly runtime flow -> ContextEnvelopeBuilt -> AI Engine / provider registry -> operation generation provider adapter -> structure job operation orchestration flow -> completed StructureJob response -> structure job operation flow -> runtime operation routing adapter -> Operation Router -> audit persistence port -> audit SQL adapter -> Turso operation audit executor -> Turso / operation projection persistence flow -> projection persistence port or proposal persistence port. Audit persistence failure -> operation audit recovery queue port. No direct AI-to-SoT write path exists from provider, Operation Router, projection persistence, or proposal persistence to canonical notes / sections / blocks.

## 移行用の seam

一時的な mock providers は test/dev のみで許可される。

## 削除対象

AI runtime adapter の外に散在する provider-specific calls を削除する。

## ガード / 検証

Runtime PRs は contract dependencies を明示し、note structure route handler / scheduler runtime flow / context assembly runtime flow / Agent-local scheduler adapter / StructureJob work queue port / StructureJob processor flow からの provider SDK / Operation Router direct import / audit persistence direct write / canonical Note/Section/Block write、StructureJob processor flow が no queued job で downstream work へ進む path、StructureJob Agent handler が invalid ContextEnvelopeBuilt 前に provider/orchestration へ進む path、operation generation provider flow からの Operation Router / audit persistence call、Operation Router を迂回する direct apply path、operation routing / projection / proposal path が direct note repository mutation を受け付ける path、provider/context failure が projection persistence へ進む path、non-completed StructureJob からの routing、generated projection 依存、executor での operation schema/policy/status inspection、SQL statement order の破壊、empty statement list の no-op success、partial-write semantics の隠蔽、recovery queue 内での retry/transaction 実行がないことを検証しなければならない。
