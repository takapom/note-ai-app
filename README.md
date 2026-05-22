# AI ネイティブノートアプリ — Codex 開発キット

このキットには、AI ネイティブなノートアプリケーションを開発するためのリポジトリ指示、契約、スキル、サブエージェント向けブリーフ、Superset タスクテンプレート、信頼できる唯一の情報源の権威グラフが含まれています。

生成日: 2026-05-17

## プロダクト概要

このアプリは、Notion のクローンでも、Obsidian プラグインでも、ノート横に置かれる AI チャットパネルでもありません。これは次の性質を持つ AI ネイティブなノートワークスペースです。

- ユーザーは 1 つに統一されたノートサーフェスと対話する。
- ユーザーが書いた内容が 信頼できる唯一の情報源である。
- AI はキー入力ごとではなく、ノートを閉じる、タブを切り替える、アプリを離れるタイミングでノートを構造化する。
- AI は自由形式の構造結果ではなく、operation を返す。
- AI 由来の構造は、同じノートサーフェス内にある編集可能な投影である。
- メモリとセマンティックグラフ は、派生され、ソースに裏付けられ、取り消し可能な投影である。

## このキットの使い方

1. ファイルをリポジトリのルートにコピーします。
2. `AGENTS.md` を確認し、リポジトリが scaffold された後で パッケージマネージャー / コマンド を調整します。
3. `.mcp.json` または `.codex/config.example.toml` で Superset MCP を設定します。
4. `superset/tasks/*.md` を使って Superset タスクを作成します。
5. 各実装タスクの前に、Codex に `AGENTS.md` と関連する契約を読ませます。

## 最重要 信頼できる唯一の情報源 ドキュメント

- `docs/contracts/documentation-system.md`
- `docs/contracts/authority-graph.md`
- `docs/contracts/repository-topology.md`
- `docs/contracts/product-principles.md`
- `docs/contracts/mvp-scope.md`
- `docs/contracts/mvp-acceptance.md`
- `docs/contracts/app-note-model.md`
- `docs/contracts/data-model.md`
- `docs/contracts/ai-structuring-lifecycle.md`
- `docs/contracts/operation-return-contract.md`
- `docs/contracts/api-events.md`
- `docs/contracts/context-assembly.md`
- `docs/contracts/frontend-ui.md`
- `docs/contracts/non-functional-requirements.md`
- `docs/contracts/cloudflare-agents-turso.md`
- `docs/contracts/superset-codex-workflow.md`

## 主要な非交渉事項

- 永続的な AI チャットパネルを MVP の中核として実装しないでください。
- MVP で AI モード切り替えを実装しないでください。
- キー入力ごとに AI 構造化を実行しないでください。
- 内部 信頼できる唯一の情報源 として Markdown を使わないでください。MVP で Markdown-compatible authoring shortcuts を提供する場合も、保存・構造化の正本は app-specific Block / Section model です。
- AI がユーザー作成ブロックを直接書き換えることを許可しないでください。
- MVP のノートサーフェスと 操作パイプラインが安定する前に、外部連携を追加しないでください。

## 要件定義の扱い

`ai_native_note_requirements.md` は target requirements の入力文書です。実装判断では、内容を `docs/contracts/**` に分配した契約を SoT として参照します。

実装前の違和感や未決定性の切り分けは `docs/guides/implementation-readiness-guide.md` を参照してください。
