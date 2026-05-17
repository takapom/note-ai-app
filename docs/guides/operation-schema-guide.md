# 操作スキーマガイド

ドキュメント種別: ガイド。権威: `docs/contracts/operation-return-contract.md`。

## 操作設計の原則

- AI は操作のみを返します。
- 操作は安定した ID を対象にします。
- 操作にはソーススパンを含めます。
- 関連する場合、操作には信頼度を含めます。
- 操作ルーター がポリシーを判断します。

## MVP 操作タイプ

- `create_semantic_unit`
- `create_relation`
- `create_memory_candidate`
- `insert_assist_block`
- `mark_stale`
- `no_op`

## 操作を追加する

1. セマンティクスが変わる場合は `docs/contracts/operation-return-contract.md` を更新します。
2. `contexts/ai-operations/src/contract/operationContract.ts` を更新します。
3. スキーマテストを追加します。
4. 操作ルーター テストを追加します。
5. 生成レジスターを更新します。
