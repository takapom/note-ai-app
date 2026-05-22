# AGENTS.md

このリポジトリは、AI ネイティブノートアプリを開発するための Codex 開発キットです。人間のレビュアー、Codex、Superset 経由のサブエージェントが同じ契約を参照して作業します。

AGENTS.md は作業前の入口です。ポリシーや仕様の信頼できる唯一の情報源ではありません。判断が必要な場合は `docs/contracts/**` を優先し、実装時の live semantics は `contexts/*/src/contract/*` を確認してください。

## アプリ概要

このアプリの目的は、ユーザーが自然に書いたノートを source of truth として保持し、AI が後から構造化・要約・関連付け・記憶候補化を行う統一ノートサーフェスを提供することです。MVP の初期利用者は知的作業をする個人です。

確認済みのプロダクト境界は `README.md`、`docs/contracts/product-principles.md`、`docs/contracts/mvp-scope.md`、`docs/contracts/mvp-acceptance.md` を参照してください。

MVP の中心ループは `write -> leave note -> background structure -> next open digest -> editable AI assist blocks` です。実際に書く面は Notion-like な block editor と Markdown-compatible authoring shortcuts を持ってよいですが、Markdown を内部 SoT にする設計は MVP 外です。永続的な AI チャットパネル、AI モード切り替え、外部連携、毎キー入力の AI 構造化も MVP 外です。

## 権威と参照順序

変更時は次の順で authority を確認します。

1. `docs/contracts/**`: policy、invariant、scope、topology の SoT。
2. `contexts/*/src/contract/*`: TypeScript の live product semantics。
3. `apps/*/docs/*contract.md`: app-local の UI / runtime 契約。
4. `docs/generated/**`、`apps/workspace-api/generated/**`: 生成された evidence / projection。
5. `superset/tasks/**`、`agents/subagents/**`、issue / PR: 作業追跡やブリーフィング。policy ではありません。

`ai_native_note_requirements.md` は要件入力です。実装判断に使う前に、必要な内容を `docs/contracts/**` に反映してください。

## ADR / Records の扱い

`docs/records/**` は active policy ではありませんが、設計判断の履歴と背景です。architecture、bounded context、document model、scheduler、AI operation、runtime topology を変更する場合は、owner contract を確認した後、関連する ADR / record を確認してください。

ADR / record と `docs/contracts/**` が矛盾する場合は `docs/contracts/**` を優先します。ADR / record にしか存在しない判断を実装に使う場合は、先に該当内容を `docs/contracts/**` に反映してください。

## リポジトリ構成

- `docs/contracts/**`: 契約、権威グラフ、トポロジー、MVP 範囲、UI、データ、runtime、検証レーン。
- `docs/records/**`: ADR、readiness review、gap review などの判断背景と履歴。policy ではありません。
- `contexts/*/src/contract/*`: Note Model、Scheduler、Context Assembly、Memory、AI Operations、Topology の live contracts。
- `apps/worker/src/**`: Worker / Agents / Turso / provider 境界の runtime flow、ports、adapters。
- `apps/web/docs/**`: 統一ノートサーフェスの app-local UI contract。現時点で UI 実装本体の path ではありません。
- `apps/workspace-api/generated/**`: OpenAPI などの generated API projection。
- `tests/contracts/**`、`tests/docs/**`: contract / runtime / topology / generated register の検証。
- `scripts/**`: contract verification と generated register の補助スクリプト。
- `agents/subagents/**`: サブエージェント向けブリーフィング。SoT ではありません。
- `superset/tasks/**`: Superset タスクテンプレートと作業単位。

## アーキテクチャ

この repo の依存方向は `docs/contracts/repository-topology.md` が所有します。要約すると、`docs/contracts/**` が方針を定め、`contexts/*/src/contract/*` が live semantics を表現し、`apps/*` の runtime / UI / generated artifacts がそれを消費します。

許可される主な流れは次の通りです。

- `apps/web` は note surface contract と context contracts を利用し、UI events を発行する。
- `apps/worker` は HTTP、Cloudflare Agents、AI SDK、Turso access を接続する runtime boundary であり、product policy を所有しない。
- Cloudflare Agent-local SQL は edit buffer、dirty tracking、pending jobs、retry queue などの一時状態だけを持つ。
- Turso は notes、sections、blocks、semantic projections、memory、AI operation audit の canonical persistence である。
- AI structuring path は canonical Note / Section / Block を直接更新しない。AI output は operation として Operation Router、audit、projection / proposal boundary を通る。

詳細は `docs/contracts/repository-topology.md`、`docs/contracts/cloudflare-agents-turso.md`、`docs/contracts/api-events.md` を参照してください。

## 境界付けられたコンテキスト

実装境界は「どの invariant を誰が所有するか」で判断します。UI route、DB table、共有パッケージの近さだけで所有者を決めないでください。

| コンテキスト | 所有する責務 | 主な path |
| --- | --- | --- |
| Note Model | Note / Section / Block、H1/H2/H3 section boundary、user-authored blocks と AI projections の区別 | `docs/contracts/app-note-model.md`, `docs/contracts/data-model.md`, `contexts/note-model/src/contract/*` |
| Scheduler | BlockChanged、dirty scope、許可された構造化 trigger、StructureJob planning、context_hash dedupe | `docs/contracts/ai-structuring-lifecycle.md`, `contexts/scheduler/src/contract/*` |
| Context Assembly | AI に渡す bounded ContextEnvelope、K limits、budget、untrusted content boundary | `docs/contracts/context-assembly.md`, `contexts/context-assembly/src/contract/*` |
| Memory | source-backed memory、status lifecycle、context eligibility、user approval semantics | `docs/contracts/memory.md`, `contexts/memory/src/contract/*` |
| AI Operations / Operation Router | operation schema、source span、confidence、policy classification、audit record、safe apply / reject | `docs/contracts/operation-return-contract.md`, `contexts/ai-operations/src/contract/*` |
| Runtime / Persistence | Worker route、Agents、provider adapter、Turso / Agent-local SQL adapters、runtime ports | `docs/contracts/cloudflare-agents-turso.md`, `docs/contracts/backend-runtime.md`, `apps/worker/src/**` |
| UI Surface | 統一ノートサーフェス、AI Assist Block、Memory candidate block、next open digest、provenance UI | `docs/contracts/frontend-ui.md`, `docs/contracts/unified-note-surface.md`, `apps/web/docs/*` |
| API / Events | UI events、backend events、MVP API surface、route handler の意味 | `docs/contracts/api-events.md`, `apps/workspace-api/generated/openapi.json` |
| Documentation / Governance | ドキュメント種別、authority graph、verification lanes、Superset / Codex workflow | `docs/contracts/documentation-system.md`, `docs/contracts/authority-graph.md`, `docs/contracts/verification-lanes.md`, `docs/contracts/superset-codex-workflow.md` |

context 間の依存は `docs/contracts/repository-topology.md` に従います。`contexts/*` は `apps/*` や generated projections から import してはいけません。

## サブエージェントの扱い

サブエージェント定義は `agents/subagents/*.md` にあります。これは安定したブリーフィングであり、契約の代替ではありません。ルーティングの概要は `docs/guides/subagent-routing-guide.md` を参照してください。

サブエージェントに任せてよい作業:

- owner contract が明確な、狭い実装・テスト・レビュー。
- Note Model、Scheduler、Context Assembly、Memory、AI Operations、Runtime、Frontend surface など、担当 path が限定できる変更。
- 既存 contract に沿った fixtures、adapters、contract tests、generated register の確認。

メインエージェントまたは人間が判断すべき作業:

- MVP scope、product principle、topology、authority graph を変える判断。
- 複数 context の invariant を同時に変更する設計判断。
- `docs/contracts/**` に存在しない新機能やプロダクト方針。
- 外部連携、AI chat、AI mode switcher、Markdown SoT など MVP 外の追加。Markdown-compatible authoring shortcuts は Markdown SoT ではありません。

サブエージェントへの指示には、目的、owner contract、触ってよい path、触らない path、検証コマンド、停止条件を含めます。戻り値には変更 path、検証結果、残リスク、follow-up を求めてください。

## 作業ルール

- 変更前に owner contract を確認し、必要なら live contract と tests を読む。
- policy を README、guide、issue、PR 説明、generated file に移さない。
- shared convenience package を所有権の近道として作らない。
- 明示された移行境界なしに compatibility bridge、dual-read、dual-write を追加しない。
- AI provider、Operation Router、Turso、UI を ad hoc に直結しない。
- User-authored Block を AI が直接 rewrite / delete / mutate する経路を作らない。
- generated artifacts は原則として generator を通じて更新する。
- 複雑なタスクでは、実装前に計画を作り、契約にない判断が必要なら停止する。

## 検証

標準コマンドは `package.json` と `docs/contracts/verification-lanes.md` を参照します。

- typecheck: `npm run typecheck`
- lint: `npm run lint`
- unit tests: `npm run test`
- full verification: `npm run verify`
- generated register check: `npm run docs:register:check`
- contract checks: `npm run contracts:verify`

変更内容に応じて、note model、operation、scheduler、context、frontend、runtime、security、api/event、NFR、acceptance の該当レーンを選んでください。AI runtime / topology の変更では、canonical Note / Section / Block への直接 mutation がないことを重点的に確認します。
