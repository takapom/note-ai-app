---
name: domain-primitives-and-always-valid
description: >-
  Domain Primitive と Always-Valid Domain Model を設計するときに使う。無効な値を作れない型、
  Smart Constructor、構築時検証、不変性、NonEmpty、範囲制約、Money、Email、ID 型などで
  不変条件を primitive ではなく型に閉じたい場合に使う。
---

# Domain Primitives And Always Valid

無効な状態を作ってから validate するのではなく、parse して valid な型に変換する。

## 判断フロー

1. その値に常に守るべき制約があるか確認する。
2. 制約があるなら primitive のまま流さず、生成時に検証する型を作る。
3. 複数値が不可分なら、1つの domain primitive または値オブジェクトにまとめる。
4. 生成失敗は例外、Result、Either などプロジェクトの流儀で明示する。
5. 生成後は無効状態へ戻れない API にする。

## 設計規律

- constructor は private または制御された factory にする。
- `Email.create(raw)` のように境界で parse する。
- `string` へ戻す accessor は最小限にし、ドメイン内部では型を維持する。
- 値オブジェクトは不変にする。
- バリデーション重複を UI、DTO、use case、entity に散らさない。

## Bad

```typescript
function invite(email: string) {
  if (!email.includes("@")) throw new Error("invalid");
}
```

## Good

```typescript
function invite(email: Email) {
  // email はここに来た時点で valid
}
```

## レビューチェックリスト

- 無効な値を domain model 内に持ち込める経路がないか。
- 同じ validation が複数箇所に散っていないか。
- primitive へ戻した値を再び domain 内で使っていないか。
- 型の生成失敗が呼び出し側に明示されているか。

## 関連 skill

- `when-to-wrap-primitives`
- `domain-building-blocks`
