# Worker Runtime のローカル契約

ドキュメント種別: オーナーローカルのランタイムポリシー。権威: `docs/contracts/backend-runtime.md`、`docs/contracts/cloudflare-agents-turso.md`、`docs/contracts/api-events.md`、`docs/contracts/data-model.md`、`docs/contracts/vendor-lock-avoidance.md`。

## ローカルで所有するもの

- HTTP ルーティング。
- 認証境界。
- Cloudflare Agent ルーティング。
- Turso serverless 接続ヘルパー。
- Turso/libSQL-like client interface に対する operation audit SQL executor。
- operation audit persistence failure の recovery queue port。
- AI SDK プロバイダーレジストリアダプター。
- note leave / manual organize / next open API routing。
- MVP API surface の method/path matching、path param extraction、workspace/user context passing、handler delegation、response mapping を行う framework-neutral worker HTTP router。
- standard `Request` / `Response` を framework-neutral worker HTTP router に接続する Worker fetch entrypoint。
- Cloudflare deployment config は `wrangler.toml` に閉じた volatile deployment detail です。Worker runtime は配信 path、static asset directory、route pattern の product policy を所有しません。
- canonical Note document persistence port を通じた Note Block create/update/delete command boundary。
- Next Open Digest preparation projection を読む read-only digest boundary。
- Provenance Popover 用に canonical block source から bounded excerpt と source metadata だけを読む read-only provenance lookup boundary。
- Memory candidate の accept/reject/edit/delete/hold を canonical memory_items の status/content/review metadata update に限定する memory review boundary。
- AI operation proposal の pending/accepted/dismissed state だけを永続化する operation proposal SQL boundary。
- accepted `create_memory_candidate` operation proposal intent を canonical memory_items candidate write intent に変換する memory candidate proposal boundary。
- note leave / manual organize / next open route input を scheduler runtime flow に接続する note structure route handler。
- NoteAgent scheduled StructureJob を WorkspaceBrainAgent の workspace-scoped queue に渡し、Durable Object alarm で background processor を起こす explicit background dispatch boundary。
- valid ContextEnvelopeBuilt から provider/orchestration boundary に接続する StructureJob Agent handler。
- queued StructureJob claim と running/completed/failed transition を扱う StructureJob work queue port。
- scheduler contract output を runtime ports へ渡す scheduler runtime flow。
- scheduler runtime ports の Agent-local SQL statement adapter。
- Turso canonical sections を `SchedulerNoteSnapshotPort` として読む scheduler note snapshot adapter。
- StructureJob target と retrieval port output を Context Assembly contract へ渡す context assembly runtime flow。
- Turso canonical notes / sections / blocks を `ContextAssemblyTargetSnapshotPort` として読む context assembly target snapshot adapter。
- semantic unit projections を `ContextAssemblyLocalStructurePort` として読む context assembly local structure adapter。
- related semantic unit projections と explicit note/block excerpt candidates を `ContextAssemblyRelatedContextRetrievalPort` として読む context assembly related context adapter。
- workspaceId / userId で境界付けた memory candidates と canonical memory_items を `ContextAssemblyMemoryRetrievalPort` として読む context assembly memory context adapter。
- ContextEnvelopeBuilt と valid ContextEnvelope を provider registry boundary に渡す operation generation provider flow。
- provider generation success の completed StructureJob response を structure job operation flow へ渡す structure job operation orchestration flow。
- Operation Router audit records を audit persistence port と recovery queue port へ渡す operation audit persistence flow。

## 所有してはいけないもの

- プロダクトセマンティクス。
- 操作スキーマのセマンティクス。
- Frontend UI ポリシー。

## ローカル不変条件

- AI adapter の外で provider 固有の呼び出しを行わないでください。
- Turso は正規の永続化先です。
- Agent-local SQL は一時的なものに限ります。
- UI event から AI provider または Turso へ直接ショートカットしないでください。
- worker HTTP router は method/path matching、path param extraction、workspace/user context passing、handler delegation、response mapping だけを担当してください。scheduler policy、Note Model policy、memory policy、Operation Router policy、provider calls、SQL details を所有してはいけません。
- Worker fetch entrypoint は request parsing、deployment-owned auth verifier seam、workspace/user context normalization、JSON body parsing、runtime port factory wiring、router delegation、Response mapping だけを担当してください。deployment-only `GET /__ann/bootstrap` は normalized runtime identity と deployment/URL supplied noteId から browser mount metadata だけを返し、runtime port factory を呼び出してはいけません。invalid auth、invalid JSON、missing workspaceId、invalid route / method mismatch では port factory を呼び出してはいけません。
- Worker default runtime port wiring module は deployment-supplied Turso / Agent-local SQL bindings から runtime ports を組み立てる infrastructure composition boundary にしてください。HTTP parsing、auth policy、product policy、Operation Router policy、provider calls を所有してはいけません。
- `wrangler.toml` は Cloudflare deployment entrypoint と Web static build artifact path と Worker-first route patterns を接続するだけにしてください。Turso URL/token、auth shared secret、workspace/user/note id、Note Model、Operation Router、AI provider policy を deployment config に直書きしないでください。
- worker auth/workspace boundary は request header、env、entrypoint context、または injected deployment-owned verifier が返した verified identity から workspaceId と任意の userId を stable non-sentinel runtime id として正規化するだけにしてください。configured shared secret がある場合は provider-neutral な request secret 照合だけを行い、auth provider、JWT package、workspace membership policy、SQL、Agent、provider、Operation Router を所有してはいけません。production deployment の exact vendor / token verification は repo-owned code ではなく injected verifier が所有します。invalid workspaceId、invalid optional userId、shared secret mismatch、invalid verifier result / failure では port factory を呼び出してはいけません。
- Cloudflare Agent binding foundation は NoteAgent / WorkspaceBrainAgent の framework-neutral delegate class と descriptor を中心にしてください。deployable Durable Object adapter は Cloudflare runtime base class を継承し、runtime flow へ input を委譲するだけにしてください。provider SDK、SQL、Operation Router、audit persistence、canonical Note/Section/Block write を所有してはいけません。
- NoteAgent と WorkspaceBrainAgent の Durable Object-local SQL は暗黙共有ではありません。NoteAgent が作った queued StructureJob を WorkspaceBrainAgent が処理するには、Worker runtime composition が request `userId` を含む WorkspaceBrainAgent enqueue RPC へ明示的に dispatch してください。この dispatch は Agent-local queue write と Durable Object alarm scheduling だけを行い、provider、Operation Router、audit persistence、projection persistence、canonical Note/Section/Block write を呼び出してはいけません。alarm は保存済み process command を使って 1 wake あたり 1 job だけ処理してください。
- note block command boundary は Note document persistence port の load/save と Note Model validation だけを扱ってください。browser editor 由来の block create では frontend-generated ID を受け取らず、runtime command boundary が stable Block ID を作ってから canonical user block として保存します。scheduler、Context Assembly、provider、Operation Router、audit、memory、projection writes を呼び出してはいけません。
- next open digest read boundary は prepared digest projection を read-only で返してください。missing digest で fake content を作らず、provider、Operation Router、audit、memory activation、Context Assembly を呼び出してはいけません。
- provenance lookup boundary は workspaceId、sourceSpanId、sourceBlockId、finite offsets を検証してから source_spans / ai_operations の source reference と canonical block source を read-only で照合してください。不正な span では query せず、full note / full workspace dump、provider、Operation Router、audit write、memory activation、canonical Note/Section/Block write を呼び出してはいけません。
- memory review boundary は workspaceId、userId、memoryId、now、edit content を検証してから source-backed candidate/pending memory の status、edit content、review metadata だけを更新してください。不正な primitive や invalid edit content では query/write せず、source provenance、canonical Note/Section/Block、provider、Operation Router、Context Assembly、audit persistence を変更または呼び出してはいけません。
- operation proposal SQL boundary は operation_proposals の proposal state と audit record JSON の保存/復元だけを担当してください。Operation Router policy の再分類、provider、audit write path、projection apply、canonical Note/Section/Block write を呼び出してはいけません。
- memory candidate proposal boundary は approved intent から `create_memory_candidate` だけを source-backed `MemoryItemContract` candidate/pending に変換し、`MemoryCandidatePersistencePort` へ渡してください。Worker HTTP accept route/default port wiring で明示的に接続し、accept/dismiss handler には memory write を追加せず、invalid primitive、workspace mismatch、source provenance のない item、non-memory operation では persistence port を呼ばないでください。Turso adapter は `memory_items` insert だけを実行してください。
- note structure route handler は route/event normalization、auth/workspace context、runtime port wiring、scheduler runtime flow 呼び出し、response mapping だけを担当してください。provider、Operation Router、audit persistence、canonical Note/Block write を呼び出してはいけません。
- StructureJob Agent handler は context assembly runtime flow を先に呼び、valid ContextEnvelopeBuilt の場合だけ structure job operation orchestration flow に進んでください。invalid context assembly では provider、Operation Router、audit persistence、canonical Note/Block write を呼び出してはいけません。
- StructureJob work queue port は claimNextQueuedJob、markJobCompleted、markJobFailed だけを公開し、invalid primitive を valid result にしてはいけません。provider、Operation Router、audit persistence、canonical Note/Block write、SQL adapter details を含めないでください。
- scheduler runtime flow から provider、Operation Router、audit persistence を呼び出さないでください。
- invalid scheduler input を persistence port に渡さないでください。
- scheduler Agent-local SQL adapter は temporary state だけを書いてください。canonical notes/sections/blocks を更新せず、trigger/dedupe policy を再計算しないでください。
- scheduler note snapshot adapter は sections を read-only で読み、任意の Agent-local dirty mark overlay 以外の policy を持たないでください。
- context assembly runtime flow は `ContextEnvelopeBuilt` を valid ContextEnvelope からだけ返してください。invalid runtime input、retrieval failure、invalid envelope、budget violation では provider、Operation Router、audit persistence を呼び出さないでください。
- Context Assembly retrieval ports は target snapshot、local structure、related context、memory candidates の read-only input だけを返してください。runtime request の userId は各 retrieval port に渡し、memory retrieval は workspaceId と userId の両方で境界付けてください。retrieval order、K limits、context budget、trust boundary は Context Assembly contract の責務です。
- context assembly target snapshot adapter は canonical notes / sections / blocks を read-only で読むだけにしてください。`description_effective` priority、K limits、context budget、provider、Operation Router、audit persistence を実装しないでください。
- context assembly local structure adapter は semantic unit projections だけを read-only で読み、canonical blocks、memory、operation audit、provider、Operation Router を参照しないでください。
- context assembly related context adapter は precomputed related candidates から note card と block excerpt だけを読み、full note / full workspace dump、memory、operation audit、provider、Operation Router を参照しないでください。
- context assembly memory context adapter は `memory_context_candidates` と `memory_items` だけを read-only で読み、`memory_context_candidates.user_id = ?` と `memory_items.user_id = ?` を必須にしてください。returned memoryContext item に workspaceId/userId を含めず、active/pinned の最終 filtering、K limits、context budget、trust boundary を実装しないでください。
- operation generation provider flow は running StructureJob、valid `ContextEnvelopeBuilt` event、valid ContextEnvelope だけを mockable provider port に渡してください。provider success のときだけ completed StructureJob response と operations payload を返し、provider failure / invalid runtime input / invalid ContextEnvelope では completed response を返さないでください。
- operation generation provider flow は provider SDK、Operation Router、audit persistence、canonical Note/Block write、operation schema/policy validation を import または実行しないでください。provider adapter は ContextEnvelope を full workspace dump に戻してはいけません。
- structure job operation orchestration flow は provider generation flow の `completedStructureJobResponse` だけを `structureJobOperationFlow` へ渡してください。downstream へ渡す AI payload は `completedStructureJobResponse.aiResponse` です。provider failure / unavailable / invalid generation input / invalid ContextEnvelope では connector 内で停止し、Operation Router、audit persistence、canonical Note/Block write を呼ばないでください。
- Operation Router を経由しない AI operation 適用を行わないでください。
- completed StructureJob response 以外を Operation Router に渡さないでください。
- provider failure は operation routing せず、Note/Block source of truth を変更しないでください。
- audit persistence failure は routing decision を書き換えず、retry/recovery 対象として扱ってください。
- operation routing flow は Operation Router 呼び出しと operation audit persistence flow の接続だけを担い、audit save loop / recovery enqueue の詳細を直接所有しないでください。
- operation audit recovery queue は failure payload を記録するだけにしてください。retry、transaction、Turso executor 呼び出し、policy/status 再分類を queue 内で実行しないでください。
- Turso operation audit executor は audit persistence adapter から受け取った SQL statement list を順番どおり実行してください。
- Turso operation audit executor は empty statement list を拒否し、Turso client を呼び出さないでください。
- Turso operation audit executor は途中 failure を infrastructure failure として上位へ伝播し、policy/status/routing decision へ変換しないでください。
- 現在の Turso operation audit executor は非トランザクショナルな逐次 executor です。途中 failure 時に partial write があり得ることを隠さず、rollback/retry/transaction は明示的な別境界として扱ってください。
- Turso operation audit executor は operation schema、policy/status semantics、`ai_operations` / `source_spans` の field-level 意味を見ないでください。
