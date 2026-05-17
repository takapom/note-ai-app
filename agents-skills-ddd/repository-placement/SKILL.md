---
name: repository-placement
description: >-
  リポジトリインターフェースをどの層に置くべきか判断するときに使う。ドメイン層に repository を置くべきか、
  use case/application 層の output port として置くべきか、domain model が repository に依存していないかをレビューする。
---

# Repository Placement

リポジトリの配置は依存方向と結合のガードレールである。

## 推奨

リポジトリインターフェースは application/use case 層に置く。実装は infrastructure/adapters 層に置く。domain model から repository を import できない構造にする。

## 判断フロー

1. domain model が repository を import していないか確認する。
2. repository interface が domain 層にあり、domain service から使いやすくなっていないか確認する。
3. use case が必要とする永続化能力として interface を定義する。
4. infra 実装がその interface を実装する。

## Bad

```text
domain/order/Order.ts
domain/order/OrderRepository.ts
```

## Good

```text
domain/order/Order.ts
application/order/OrderRepository.ts
infrastructure/order/SqlOrderRepository.ts
```

## アンチパターン

- 集約メソッドが repository を引数に取る。
- domain service が複数 repository を注入される。
- infrastructure 層に interface と implementation の両方を置き、application が infra に依存する。

## レビューチェックリスト

- domain 層は persistence の概念から独立しているか。
- repository interface は use case の必要性で定義されているか。
- implementation は adapter として差し替え可能か。
- 物理配置が依存方向を強制しているか。

## 関連 skill

- `repository-design`
- `domain-building-blocks`
