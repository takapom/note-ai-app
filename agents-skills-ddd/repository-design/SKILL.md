---
name: repository-design
description: >-
  DDD のリポジトリ設計をレビューするときに使う。集約単位の repository か、テーブル名や DTO 名で作っていないか、
  CQS、find/store の戻り値、複数集約更新、リポジトリ内ビジネスルール、リポジトリから別リポジトリ呼び出しを判断する。
---

# Repository Design

リポジトリは集約の永続化境界を表す。クエリ便利クラスやビジネスルール置き場にしない。

## 判断フロー

1. リポジトリ名が集約名に対応しているか確認する。
2. `find` は集約または nullable/result を返しているか確認する。
3. `store` は集約を受け取り、保存結果として別のドメイン判断を返していないか確認する。
4. query 用 DTO や read model は repository ではなく query service として分ける。
5. リポジトリ内にビジネスルールがあれば集約、domain service、application service へ戻す。

## 設計規律

- repository は集約単位にする。
- テーブル単位、DTO 単位、画面単位で作らない。
- command と query を混ぜすぎない。
- repository から別 repository を呼ばない。
- 永続化マッピングは明示するが、ドメイン判断を持たせない。

## アンチパターン

- `OrderItemsRepository` のように子エンティティ単位で作る。
- `OrderRepository.findDashboardRows()` のように read model を返す。
- `canDeleteBrand()` のようなビジネス判断を repository に置く。
- `store(order)` が `Invoice` も作る。

## レビューチェックリスト

- repository は集約ルートに対応しているか。
- 戻り値が ORM record や DTO になっていないか。
- メソッド名にドメイン判断が入り込んでいないか。
- 1 repository が複数集約を更新していないか。
- read model 用クエリと集約復元が混ざっていないか。

## 関連 skill

- `aggregate-design`
- `repository-placement`
- `ddd-module-pattern`
