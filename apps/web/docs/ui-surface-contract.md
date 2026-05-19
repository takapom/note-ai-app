# Web App UI サーフェス契約

ドキュメント種別: オーナーローカルの UI/プロダクトポリシー。権威: `docs/contracts/frontend-ui.md`、`docs/contracts/unified-note-surface.md`、`docs/contracts/non-functional-requirements.md`。

## ローカルで所有するもの

- 統一ノートサーフェスの Web コンポーネント配置。
- framework-neutral な NoteSurface HTML renderer と render event descriptor。
- framework-neutral な NoteSurface event controller。render event descriptor と caller supplied mapping から API intent input を組み立て、API transport に渡す接続境界。
- framework-neutral な NoteSurface action input resolver。render event descriptor の target/action/API intent と caller supplied lookup から、operationId / memoryId / noteId / provenance / memory edit content だけを取り出して event controller に渡す境界。
- framework-neutral な NoteSurface document-derived resolver options composition。Note document の AI blocks / memory candidate blocks / annotations と caller supplied projection ID maps を照合し、action input resolver options に渡す lookup を組み立てる境界。Web 側では新しい operation / memory / provenance / note ID を生成しない。
- framework-neutral な NoteSurface product state composition。caller supplied Note document、view state、projection ID maps から App bootstrap に渡せる `document`、`viewOptions`、`resolverOptions` だけを組み立てる境界。Web 側では新しい operation / memory / provenance / note / block ID を生成せず、canonical Note / Section / Block を直接 mutation しない。
- framework-neutral な NoteSurface product app entrypoint。caller supplied provider snapshot から product state を組み立て、App bootstrap の mount に渡す concrete app wiring だけを所有する境界。Web 側では Worker / generated / provider SDK / auth policy / global fetch / 実 DOM implementation / ID generation / canonical Note / Section / Block の直接 mutation を所有しない。
- framework-neutral な NoteSurface HTTP product provider。caller supplied fetch-like binding で `GET /notes/:noteId` の snapshot を読み、Product App entrypoint に渡す provider result だけを所有する境界。response に optional `viewState` / `projectionMaps` が含まれる場合は、operation / memory / provenance / sourceSpan IDs を生成せず caller supplied snapshot として product state input に写す。Web 側では Worker / generated / provider SDK / auth policy / global fetch / 実 DOM implementation / ID generation / canonical Note / Section / Block の直接 mutation / write routes を所有しない。
- framework-neutral な NoteSurface HTTP product app composition。HTTP product provider と Product App entrypoint を接続するだけの境界。Web 側では global fetch / DOM query / framework runtime / deployment config / provider SDK / ID generation / canonical Note / Section / Block の直接 mutation を所有しない。
- framework-neutral な NoteSurface browser runtime。view model、HTML renderer、event controller、DOM 風 host adapter を接続し、実 DOM API には依存しない mount / action dispatch 境界。
- framework-neutral な NoteSurface app bootstrap。caller supplied note document、DOM root、fetch-like binding、workspace/user metadata、resolver lookup から view model、API transport、action input resolver、event controller、DOM host、browser runtime を組み立てる composition 境界。
- NoteSurface DOM host adapter。実 DOM API を所有する薄い adapter として、root HTML 差し替え、delegated action click binding、render event descriptor による dataset 補完だけを行う。
- AI Assist Blocks のレンダリング。
- 次回オープンダイジェストコンポーネントのふるまい。
- Provenance popover の配置。
- Note Header の title / description 表示。
- Manual Organize の command palette entry。

## 所有してはいけないもの

- ドキュメントセマンティクス。
- AI 操作スキーマ。
- Memory セマンティクス。
- ランタイムスケジューリング。

## ローカル不変条件

- MVP に永続的な AI チャットパネルを追加しないでください。
- MVP に AI モード切り替えを追加しないでください。
- NoteSurface view model は Note Model semantics を所有せず、`contexts/note-model` の document validation を消費してください。
- AI Assist Blocks は、独立した AI パネルではなく block renderer によってレンダリングされます。
- AI Assist / Memory candidate actions は user intent と API intent の model に留め、provider call や user-authored block の直接 mutation を持たせないでください。
- API intent mapping は dependency-free request descriptor に留め、Worker 実装、generated OpenAPI、provider call、auth policy を import しないでください。
- API transport は request descriptor を注入された fetch-like binding に渡すだけに留め、Worker 実装、generated OpenAPI、provider call、auth policy、user-authored block の直接 mutation を import / 所有しないでください。
- HTML renderer は dependency-free な文字列レンダリングと `data-action` / `data-block-id` などの event descriptor に留め、Worker 実装、generated OpenAPI、provider call、fetch、auth policy、user-authored block の直接 mutation を持たせないでください。
- Event controller は renderer の event descriptor、API intent mapper、API transport だけを接続し、Worker 実装、generated OpenAPI、provider call、auth policy、user-authored block の直接 mutation を import / 所有しないでください。
- Event controller は `apiIntent: none`、`edit_block`、`save_block`、`cancel_edit` を transport に送らず、operation / memory / digest / provenance の具体 ID や content は caller supplied mapping から受け取ってください。
- Action input resolver は Web 側で operation / memory / provenance ID や memory edit content を生成せず、caller supplied lookup から取得してください。Memory edit content は非文字列または空文字列なら `undefined` とし、trim などの backend validation policy は API intent mapper / runtime boundary に委譲してください。
- Resolver options from document boundary は AI Assist block には caller supplied `operationIdByBlockId`、Memory candidate block には caller supplied `memoryIdByBlockId` を対応付けてください。`source_span` annotation は最初の complete な `sourceBlockId` / `startOffset` / `endOffset` と caller supplied `sourceSpanIdByBlockId` がそろう場合だけ `provenanceByBlockId` に入れ、不完全な annotation や missing sourceSpanId から lookup を作らないでください。
- Action input resolver は digest read では renderer event descriptor の `noteId` を優先し、なければ caller supplied active note id / target mapping を使ってください。`apiIntent: none` と editor no-op actions は transport 用 input を返さないでください。
- Resolver options from document boundary は note document に既に存在する operation / memory / provenance / note references だけを action input resolver options に写してください。`crypto.randomUUID`、`Math.random`、`Date.now` などで ID を生成せず、missing reference から fake content や fallback ID を作らないでください。
- Resolver options from document boundary は App bootstrap が受け取れる caller supplied `resolverOptions` の一部として合成できることに留め、Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、実 DOM API、user-authored block の直接 mutation を import / 所有しないでください。
- Product state composition boundary は caller supplied state を組み合わせるだけに留め、NoteSurface view model、runtime、transport、DOM host を作らないでください。invalid Note document または document-derived resolver options composition の invalid result は bootstrap 前に `ok: false` と errors として返してください。`crypto.randomUUID`、`Math.random`、`Date.now` などの ID generation、canonical Note / Section / Block collection / field の直接 mutation、Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、実 DOM API を import / 所有しないでください。
- Product App entrypoint boundary は caller supplied provider snapshot を Product state composition に渡し、その結果を App bootstrap mount に渡す concrete app wiring だけに留めてください。Worker 実装、generated OpenAPI、provider SDK、provider call、auth policy、global fetch、実 DOM implementation、`crypto.randomUUID` / `Math.random` / `Date.now` などの ID generation、canonical Note / Section / Block collection / field の直接 mutation を import / 所有しないでください。
- HTTP product provider boundary は caller supplied fetch-like binding だけを使って `GET /notes/:noteId` snapshot を読む read boundary に留めてください。optional `viewState` / `projectionMaps` は response/caller supplied snapshot をそのまま product state input に渡すだけにし、operationId / memoryId / provenanceId / sourceSpanId / noteId / blockId を生成、補完、推測しないでください。Worker 実装、generated OpenAPI、provider SDK、provider call、auth policy、global fetch、実 DOM implementation、`crypto.randomUUID` / `Math.random` / `Date.now` などの ID generation、canonical Note / Section / Block collection / field の直接 mutation、POST / PUT / PATCH / DELETE routes を import / 所有しないでください。
- HTTP product app composition boundary は HTTP product provider と Product App entrypoint を接続するだけに留めてください。caller supplied fetch-like binding と caller supplied app mount options を渡す以外の policy を持たず、global fetch、DOM query、framework runtime、deployment config、provider SDK、`crypto.randomUUID` / `Math.random` / `Date.now` などの ID generation、canonical Note / Section / Block collection / field の直接 mutation を import / 所有しないでください。
- Browser runtime は renderer が返した escaped HTML を注入 host の `setHtml` に渡し、render event descriptor を `bindActionEvents` に渡してください。host から返る descriptor / dataset は event controller に委譲し、render / controller failure は boundary result として返してください。
- Browser runtime は Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、実 DOM API、user-authored block の直接 mutation を import / 所有しないでください。
- App bootstrap は composition と boundary validation だけを所有し、MVP 除外 side surfaces、backend policy、Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、user-authored block の直接 mutation を import / 所有しないでください。実 DOM root、fetch-like binding、workspace/user IDs、operation/memory/provenance mappings は caller supplied にしてください。
- App bootstrap は invalid workspaceId / userId / apiBaseUrl / root / fetchLike / note document を、transport、DOM root action binding、runtime mount の前に boundary result として返してください。
- DOM host adapter だけが `innerHTML`、`addEventListener`、`closest` などの実 DOM API を所有してよいです。adapter は event controller、transport、Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、user-authored block の直接 mutation を import / 所有しないでください。
- DOM host adapter は同じ root への再 bind 時に click listener を増殖させず、button dataset に `apiIntent` がない場合は renderer から渡された render event descriptor を action / target / blockId で照合して補完してください。
- Web NoteSurface integration source guard は `apps/web/src/noteSurface*.ts`、想定 bootstrap path `apps/web/src/noteSurfaceAppBootstrap.ts`、想定 product app entrypoint path `apps/web/src/noteSurfaceProductApp.ts`、想定 HTTP product app composition path `apps/web/src/noteSurfaceHttpProductApp.ts`、想定 HTTP product provider path `apps/web/src/noteSurfaceHttpProductProvider.ts`、想定 document-derived resolver options path `apps/web/src/noteSurfaceResolverOptionsFromDocument.ts`、想定 product state composition path `apps/web/src/noteSurfaceProductState.ts` を監視し、未実装時も path guard として維持してください。
- HTML renderer は note text、digest text、provenance excerpt を trusted HTML として扱わず、必ず escape してください。
- Memory edit / delete / snooze API intents は Worker request descriptor だけを作り、snooze は backend domain action の hold route に対応付けてください。
- Next Open Digest は compact / expandable にし、missing digest から fake content を作らないでください。
- Provenance popover は bounded excerpt と source metadata だけを持ち、full note / full workspace dump を持たせないでください。
- バックグラウンド構造化中も、執筆フローは応答性を保たなければなりません。
- AI Assist Block 挿入はカーソル位置を奪ってはなりません。
- 入力中に AI 由来の layout shift を発生させてはいけません。
- Memory candidate block はノート内で承認/拒否できなければなりません。
