# Worker Runtime のローカル契約

ドキュメント種別: オーナーローカルのランタイムポリシー。権威: `docs/contracts/backend-runtime.md`、`docs/contracts/cloudflare-agents-turso.md`、`docs/contracts/api-events.md`、`docs/contracts/data-model.md`。

## ローカルで所有するもの

- HTTP ルーティング。
- 認証境界。
- Cloudflare Agent ルーティング。
- Turso serverless 接続ヘルパー。
- AI SDK プロバイダーレジストリアダプター。
- note leave / manual organize / next open API routing。

## 所有してはいけないもの

- プロダクトセマンティクス。
- 操作スキーマのセマンティクス。
- Frontend UI ポリシー。

## ローカル不変条件

- AI adapter の外で provider 固有の呼び出しを行わないでください。
- Turso は正規の永続化先です。
- Agent-local SQL は一時的なものに限ります。
- UI event から AI provider または Turso へ直接ショートカットしないでください。
- Operation Router を経由しない AI operation 適用を行わないでください。
- completed StructureJob response 以外を Operation Router に渡さないでください。
- provider failure は operation routing せず、Note/Block source of truth を変更しないでください。
- audit persistence failure は routing decision を書き換えず、retry/recovery 対象として扱ってください。
