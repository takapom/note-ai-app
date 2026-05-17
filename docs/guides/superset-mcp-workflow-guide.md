# Superset MCP ワークフローガイド

ドキュメント種別: ガイド。権威: `docs/contracts/superset-codex-workflow.md`。

## セットアップ

プロジェクトの `.mcp.json` または Codex 設定のどちらかを使用します。

プロジェクトファイル:

```json
{
  "mcpServers": {
    "superset": {
      "type": "http",
      "url": "https://api.superset.sh/api/v2/agent/mcp"
    }
  }
}
```

Codex 設定の例:

```toml
[mcp_servers.superset]
url = "https://api.superset.sh/api/v2/agent/mcp"
```

## タスクワークフロー

1. `superset/tasks/*.md` から Superset タスクを作成します。
2. 1 つの所有者コントラクトと検証レーンを割り当てます。
3. そのタスク用に隔離された Superset ワークスペースを作成します。
4. そのワークスペースで Codex を起動します。
5. Superset で差分をレビューします。
6. Codex にレーンチェックの実行を依頼します。
7. コントラクトチェックとトポロジーチェックが通過した後でのみマージします。

## 並列化ルール

並列化しても安全なもの:

- 独立したドキュメント。
- 隔離された UI フィクスチャコンポーネント。
- 別コンテキスト向けのコントラクトテスト。
- 他のドキュメントタスクがアクティブでない後の生成レジスター更新。

並列化を避けるもの:

- 同じコントラクトファイル。
- 別ワークスペースでの操作スキーマ + 操作ルーター。
- 別ワークスペースでのデータモデル + 永続化実装。
- 別ワークスペースでのエディターコア + ブロックレンダラー。
