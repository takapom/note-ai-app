# Web App UI サーフェス契約

ドキュメント種別: オーナーローカルの UI/プロダクトポリシー。権威: `docs/contracts/frontend-ui.md`、`docs/contracts/unified-note-surface.md`、`docs/contracts/non-functional-requirements.md`。

## ローカルで所有するもの

- 統一ノートサーフェスの Web コンポーネント配置。
- framework-neutral な NoteSurface HTML renderer と render event descriptor。
- framework-neutral な NoteSurface event controller。render event descriptor と caller supplied mapping から API intent input を組み立て、API transport に渡す接続境界。
- framework-neutral な NoteSurface action input resolver。render event descriptor の target/action/API intent と caller supplied lookup から、operationId / memoryId / noteId / provenance / memory edit content だけを取り出して event controller に渡す境界。
- framework-neutral な NoteSurface browser runtime。view model、HTML renderer、event controller、DOM 風 host adapter を接続し、実 DOM API には依存しない mount / action dispatch 境界。
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
- Action input resolver は digest read では renderer event descriptor の `noteId` を優先し、なければ caller supplied active note id / target mapping を使ってください。`apiIntent: none` と editor no-op actions は transport 用 input を返さないでください。
- Browser runtime は renderer が返した escaped HTML を注入 host の `setHtml` に渡し、render event descriptor を `bindActionEvents` に渡してください。host から返る descriptor / dataset は event controller に委譲し、render / controller failure は boundary result として返してください。
- Browser runtime は Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、実 DOM API、user-authored block の直接 mutation を import / 所有しないでください。
- DOM host adapter だけが `innerHTML`、`addEventListener`、`closest` などの実 DOM API を所有してよいです。adapter は event controller、transport、Worker 実装、generated OpenAPI、provider call、auth policy、global fetch、user-authored block の直接 mutation を import / 所有しないでください。
- DOM host adapter は同じ root への再 bind 時に click listener を増殖させず、button dataset に `apiIntent` がない場合は renderer から渡された render event descriptor を action / target / blockId で照合して補完してください。
- HTML renderer は note text、digest text、provenance excerpt を trusted HTML として扱わず、必ず escape してください。
- Memory edit / delete / snooze API intents は Worker request descriptor だけを作り、snooze は backend domain action の hold route に対応付けてください。
- Next Open Digest は compact / expandable にし、missing digest から fake content を作らないでください。
- Provenance popover は bounded excerpt と source metadata だけを持ち、full note / full workspace dump を持たせないでください。
- バックグラウンド構造化中も、執筆フローは応答性を保たなければなりません。
- AI Assist Block 挿入はカーソル位置を奪ってはなりません。
- 入力中に AI 由来の layout shift を発生させてはいけません。
- Memory candidate block はノート内で承認/拒否できなければなりません。
