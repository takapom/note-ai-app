# サブエージェントルーティングガイド

ドキュメント種別: ガイド。権威: `docs/contracts/superset-codex-workflow.md`。

## サブエージェントの役割

`agents/subagents/*.md` を安定したブリーフィングファイルとして使用します。各サブエージェントは Codex タスクプロンプトのプロファイルであり、個別のポリシー所有者ではありません。

## ルーティング表

- プロダクトコントラクトの変更 -> `product-contract-keeper.md`
- トポロジーレビュー -> `topology-guardian.md`
- ノートモデルスキーマ -> `document-model-agent.md`
- AI 操作スキーマ/ルーター -> `ai-operations-agent.md`
- スケジューラー/ライフサイクル -> `scheduler-agent.md`
- コンテキスト/メモリ -> `context-memory-agent.md`
- フロントエンドのノートサーフェス -> `frontend-surface-agent.md`
- Cloudflare/Turso ランタイム -> `runtime-infra-agent.md`
- 検証/レビュー -> `verification-agent.md`
- Superset タスクのオーケストレーション -> `superset-coordinator.md`

## ルール

サブエージェントは作業を実行します。意思決定はコントラクトが所有します。
