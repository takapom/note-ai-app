# AGENTS.md

このリポジトリは、人間のレビュアーと Codex/Superset が管理するコーディングエージェントによって開発されています。

Codex は、このファイルを完全なポリシーソースではなく、参照先を示すルーティング指針として扱う必要があります。判断が必要な場合は `docs/contracts/**` を参照してください。

## リポジトリ原則

1. 変更する理由を持つオーナーが 信頼できる唯一の情報源 を所有します。
   所有権は、UI ルートの近さ、DB テーブルの近さ、利用者数、共有パッケージの都合では決まりません。所有権は、言語、ライフサイクル、不変条件、一貫性境界によって決まります。

2. トポロジーは制約です。
   レイヤーは許可された契約を通じてのみ接続されなければなりません。場当たり的な近道よりも、明確な責務と長期的な保守性を優先してください。

3. 信頼できる唯一の情報源 と投影を分離します。
   Markdown 契約、TypeScript 契約ファイル、生成ドキュメント、OpenAPI、GitHub issue、PR、CI 結果、Superset ワークスペースはいずれも真実の表面ですが、それぞれ権威が異なります。

## プロダクト上の非交渉事項

- 統一ノートサーフェス: ユーザーは 1 つのノートサーフェスと対話します。
- ユーザーが書いたテキストが主要な 信頼できる唯一の情報源 です。
- AI 由来の構造は投影です。
- アプリは内部 SoT として Markdown ではなく、アプリ固有の Block / Section ドキュメントモデルを使います。
- H1/H2/H3 見出しがセクション境界を定義します。スタイルだけで大きくしたテキストは構造ではありません。
- AI 構造化は、ノートを閉じる、タブを切り替える、アプリを離れるタイミング、および手動整理で実行されます。
- AI はキー入力ごとに構造化を実行してはいけません。
- AI は自由形式の構造結果ではなく、operation を返します。
- AI operation は、該当する場合に source span と confidence を含めなければなりません。
- AI は、ユーザーの明示的な承認なしに、ユーザーが書いたブロックを直接書き換えてはいけません。
- 外部連携は MVP の中核ではありません。
- 永続的な AI チャットパネルは MVP の中核ではありません。
- MVP に AI モード切り替えを設けません。

## 信頼できる唯一の情報源の参照先

- ドキュメントのシステム: `docs/contracts/documentation-system.md`
- 権威グラフ: `docs/contracts/authority-graph.md`
- トポロジー: `docs/contracts/repository-topology.md`
- プロダクト原則: `docs/contracts/product-principles.md`
- MVP スコープ: `docs/contracts/mvp-scope.md`
- MVP 受け入れ条件: `docs/contracts/mvp-acceptance.md`
- アプリのノートモデル: `docs/contracts/app-note-model.md`
- データモデル: `docs/contracts/data-model.md`
- AI ライフサイクル: `docs/contracts/ai-structuring-lifecycle.md`
- AI operation 契約: `docs/contracts/operation-return-contract.md`
- コンテキスト組み立て: `docs/contracts/context-assembly.md`
- UI 契約: `docs/contracts/frontend-ui.md`
- API とイベント: `docs/contracts/api-events.md`
- 非機能要件: `docs/contracts/non-functional-requirements.md`
- ランタイム契約: `docs/contracts/cloudflare-agents-turso.md`
- Codex/Superset ワークフロー: `docs/contracts/superset-codex-workflow.md`

## 期待されるタスクプロンプトの形

すべての実装タスクには次を含める必要があります。

- 目的
- コンテキスト
- 制約
- 実装メモ
- 完了条件
- 検証コマンド

複雑なタスクでは、まず計画を作成し、明示的に実装を指示されない限り計画後に停止してください。

## 検証への期待

リポジトリが scaffold されるまでは、次の意図を使ってください。

- typecheck が通ること
- lint が通ること
- unit tests が通ること
- 契約変更では schema tests が通ること
- AI operation 変更では operation router tests が通ること
- MVP 完了判定では `docs/contracts/mvp-acceptance.md` の 15 項目が満たされること

リポジトリが存在するようになった後は、`docs/contracts/verification-lanes.md` でプレースホルダーを具体的なコマンドに置き換えてください。

## 禁止事項

契約更新なしに MVP スコープを広げないでください。
ポリシーを README、ガイド、GitHub issue、PR 説明に移さないでください。
所有権の近道として共有パッケージを作らないでください。
契約が移行用の境界を明示的に許可していない限り、互換性ブリッジを作らないでください。
デフォルトで dual-read/dual-write を実装しないでください。
source-of-truth ドキュメントを黙って変更しないでください。
`ai_native_note_requirements.md` を実装判断の直接 SoT として扱わず、必要な判断を `docs/contracts/**` に反映してから実装してください。
