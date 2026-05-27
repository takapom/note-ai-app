# テストしやすさのためのインターフェース設計

良いインターフェースはテストを自然にします。

1. **依存を作らず、受け取る**

   ```typescript
   // テストしやすい
   function processOrder(order, paymentGateway) {}

   // テストしにくい
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **副作用を起こさず、結果を返す**

   ```typescript
   // テストしやすい
   function calculateDiscount(cart): Discount {}

   // テストしにくい
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **表面積を小さくする**

   - メソッドが少ないほど、必要なテストも少なくなる
   - 引数が少ないほど、テスト準備は単純になる
