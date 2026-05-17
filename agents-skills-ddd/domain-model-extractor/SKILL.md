---
name: domain-model-extractor
description: >-
  DDD 前提でない既存コードからドメインモデルを抽出するときに使う。既存の controller、service、DB model、
  DTO、validation、if 文から、集約、エンティティ、値オブジェクト、ドメインサービス、不変条件、境界を提案する。
---

# Domain Model Extractor

既存コードの技術構造をそのまま DDD 構造に移さない。散らばったルールからドメイン上の所有者を復元する。

## 分析フロー

1. 対象ユースケースと変更理由を限定する。
2. controller、service、repository、DTO、validation、DB constraint からルールを抽出する。
3. 名詞、動詞、状態、イベント、制約を一覧化する。
4. 不変条件を守る所有者を探す。
5. 集約、エンティティ、値オブジェクト、ドメインサービスへ仮配置する。
6. 既存コードとの差分と移行スライスを提案する。

## 出力形式

- 抽出したユビキタス言語
- 候補集約と集約ルート
- 候補エンティティと値オブジェクト
- 不変条件と所有者
- 集約間関係と ID 参照
- repository/use case/adapter への波及
- 最初に切り出す実装スライス

## アンチパターン

- DB table からそのまま aggregate を作る。
- 既存 service のメソッドをそのまま domain service にする。
- DTO の shape を domain object にする。
- 既存コード全体を一度に移行しようとする。

## レビューチェックリスト

- ルールの出所を既存コード上の場所で説明できるか。
- 抽出した不変条件に所有者があるか。
- 集約候補が大きすぎないか。
- 移行スライスが小さく、テスト可能か。

## 関連 skill

- `domain-model-first`
- `ddd-module-pattern`
- `aggregate-design`
