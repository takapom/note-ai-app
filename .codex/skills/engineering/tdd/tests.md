# 良いテストと悪いテスト

## 良いテスト

**統合テスト寄り**: 内部部品のモックではなく、実際のインターフェースを通じてテストします。

```typescript
// 良い例: 観測可能な振る舞いをテストする
test("有効なカートでユーザーがチェックアウトできる", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特徴:

- ユーザーや呼び出し側が気にする振る舞いをテストする
- 公開 API だけを使う
- 内部リファクタリングに耐える
- どのようにではなく、何をするかを記述する
- 1 つのテストにつき論理的な assertion は 1 つ

## 悪いテスト

**実装詳細のテスト**: 内部構造に結合しています。

```typescript
// 悪い例: 実装詳細をテストしている
test("checkout は paymentService.process を呼ぶ", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

危険信号:

- 内部コラボレーターをモックしている
- private メソッドをテストしている
- 呼び出し回数や呼び出し順序を assertion している
- 振る舞いが変わっていないリファクタリングでテストが壊れる
- テスト名が何をするかではなく、どのようにするかを説明している
- インターフェースではなく外部手段で検証している

```typescript
// 悪い例: 検証のためにインターフェースを迂回している
test("createUser はデータベースに保存する", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// 良い例: インターフェースを通じて検証している
test("createUser で作成したユーザーは取得できる", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```
