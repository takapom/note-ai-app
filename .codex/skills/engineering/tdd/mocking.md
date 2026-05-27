# いつモックするか

モックするのは **システム境界** だけです。

- 外部 API。payment、email など
- データベース。場合によっては。ただし test DB を優先する
- 時刻や乱数
- ファイルシステム。場合によっては

モックしないもの:

- 自分たちの class / module
- 内部コラボレーター
- 自分たちが制御できるもの

## モックしやすさを考慮した設計

システム境界では、モックしやすいインターフェースを設計します。

**1. Dependency Injection を使う**

外部依存を内部で作るのではなく、外から渡します。

```typescript
// モックしやすい
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// モックしにくい
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. 汎用 fetcher より SDK 風のインターフェースを優先する**

条件分岐を持つ 1 つの汎用関数ではなく、外部操作ごとに具体的な関数を作ります。

```typescript
// 良い例: 各関数を独立してモックできる
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// 悪い例: モック内に条件分岐が必要になる
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK アプローチの意味:

- 各 mock が 1 つの具体的な形を返す
- テスト準備に条件分岐が要らない
- テストがどの endpoint を使っているか見やすい
- endpoint ごとに型安全になる
