---
name: aggregate-transaction-boundary
description: >-
  集約とトランザクション境界の対応を判断するときに使う。1ユースケースで複数集約を同一トランザクション更新している、
  @Transactional が複数リポジトリを囲んでいる、1トランザクション1集約を守るべきか、結果整合性や Saga が必要かをレビューする。
---

# Aggregate Transaction Boundary

集約は強い整合性境界である。したがって、原則として 1 トランザクションで更新する集約は 1 つにする。

## 判断フロー

1. トランザクション内で更新している集約数を数える。
2. 複数集約を更新しているなら、それらが本当に別集約か疑う。
3. 同じ不変条件を守るために常に同時変更が必要なら、同一集約への統合を検討する。
4. ライフサイクルや変更理由が違うなら、別集約のまま結果整合性にする。
5. 失敗時の補償が必要なら Saga または明示的なプロセスを設計する。

## Bad

```typescript
async function createOrder(input: Input) {
  await transaction(async () => {
    await orderRepository.store(Order.create(input));
    await inventoryRepository.store(Inventory.reserve(input.items));
    await invoiceRepository.store(Invoice.issue(input));
  });
}
```

## Good

```typescript
async function createOrder(input: Input) {
  const order = Order.create(input);
  await orderRepository.store(order);
  await eventPublisher.publishAll(order.domainEvents());
}
```

## アンチパターン

- ユースケース全体を1つの巨大なトランザクションにする。
- 複数集約更新をリポジトリ内部に隠す。
- 結果整合性でよいものを強い整合性に寄せる。
- Saga を「事前チェック」や「同期バリデーション」の道具にする。

## レビューチェックリスト

- トランザクション境界は集約境界と一致しているか。
- 複数集約更新がある場合、モデリング見直しを行ったか。
- 別集約のままならイベント、outbox、リトライ、補償の設計があるか。
- ユースケースが DB 都合で境界を決めていないか。

## 関連 skill

- `aggregate-design`
- `cross-aggregate-constraints`
- `repository-design`
