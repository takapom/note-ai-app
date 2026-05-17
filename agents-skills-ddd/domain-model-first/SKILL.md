---
name: domain-model-first
description: >-
  DDD 実装をドメインモデルから始めるときに使う。テストファーストで値オブジェクト、エンティティ、集約を作り、
  インメモリリポジトリ、ユースケース、アダプタ、インフラ、統合テストへ進む開発順序を設計する。
---

# Domain Model First

ドメインルールが曖昧なうちに DB、API、UI から作らない。まずモデルを実行可能なテストで固定する。

## 開発フロー

1. ユースケースの中心コマンドを1つ選ぶ。
2. 値オブジェクトと集約のテストをドメインの言葉で書く。
3. repository なしで domain model を実装する。
4. use case を作り、in-memory repository でテストする。
5. application contract が安定してから infrastructure adapter を作る。
6. repository integration test を追加する。
7. API/UI は最後に DTO 変換と認可入口として接続する。

## 設計規律

- 最初のテストは HTTP や DB を通さない。
- domain test は不変条件、状態遷移、イベントを証明する。
- use case test は orchestration を証明する。
- infrastructure test は mapping と永続化技術の統合を証明する。

## アンチパターン

- migration と ORM model から domain model を逆算する。
- API response に合わせて aggregate を作る。
- すべてのルールを E2E でしか検証できない。
- in-memory repository が本番 repository と違う意味論を持つ。

## レビューチェックリスト

- ドメインルールは domain test で直接検証できるか。
- use case は fake repository で実行できるか。
- adapter なしで中心ルールを理解できるか。
- 実装順がドメイン判断から外側へ向かっているか。

## 関連 skill

- `domain-building-blocks`
- `aggregate-design`
- `repository-design`
