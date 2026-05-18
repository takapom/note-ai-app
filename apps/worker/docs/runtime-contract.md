# Worker Runtime のローカル契約

ドキュメント種別: オーナーローカルのランタイムポリシー。権威: `docs/contracts/backend-runtime.md`、`docs/contracts/cloudflare-agents-turso.md`、`docs/contracts/api-events.md`、`docs/contracts/data-model.md`。

## ローカルで所有するもの

- HTTP ルーティング。
- 認証境界。
- Cloudflare Agent ルーティング。
- Turso serverless 接続ヘルパー。
- Turso/libSQL-like client interface に対する operation audit SQL executor。
- operation audit persistence failure の recovery queue port。
- AI SDK プロバイダーレジストリアダプター。
- note leave / manual organize / next open API routing。
- scheduler contract output を runtime ports へ渡す scheduler runtime flow。

## 所有してはいけないもの

- プロダクトセマンティクス。
- 操作スキーマのセマンティクス。
- Frontend UI ポリシー。

## ローカル不変条件

- AI adapter の外で provider 固有の呼び出しを行わないでください。
- Turso は正規の永続化先です。
- Agent-local SQL は一時的なものに限ります。
- UI event から AI provider または Turso へ直接ショートカットしないでください。
- scheduler runtime flow から provider、Operation Router、audit persistence を呼び出さないでください。
- invalid scheduler input を persistence port に渡さないでください。
- Operation Router を経由しない AI operation 適用を行わないでください。
- completed StructureJob response 以外を Operation Router に渡さないでください。
- provider failure は operation routing せず、Note/Block source of truth を変更しないでください。
- audit persistence failure は routing decision を書き換えず、retry/recovery 対象として扱ってください。
- operation audit recovery queue は failure payload を記録するだけにしてください。retry、transaction、Turso executor 呼び出し、policy/status 再分類を queue 内で実行しないでください。
- Turso operation audit executor は audit persistence adapter から受け取った SQL statement list を順番どおり実行してください。
- Turso operation audit executor は empty statement list を拒否し、Turso client を呼び出さないでください。
- Turso operation audit executor は途中 failure を infrastructure failure として上位へ伝播し、policy/status/routing decision へ変換しないでください。
- 現在の Turso operation audit executor は非トランザクショナルな逐次 executor です。途中 failure 時に partial write があり得ることを隠さず、rollback/retry/transaction は明示的な別境界として扱ってください。
- Turso operation audit executor は operation schema、policy/status semantics、`ai_operations` / `source_spans` の field-level 意味を見ないでください。
