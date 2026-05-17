---
name: repository-placement
description: >-
  AI Native Note の repository interface、port、adapter、persistence implementation の配置を判断するときに使う。
  domain/live contract を Turso、Workers、provider SDK、UI route から独立させる。
---

# Repository 配置

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

contexts/*/src/contract の live contract は product semantics を記述する。use case が persistence を必要とするとき、repository interface は application/runtime port として現れ、implementation は adapters/infrastructure に置く。

## 配置ルール

- Domain/live contract file は Turso、Worker、HTTP、provider SDK、UI module を import してはいけない。
- apps/worker は persistence と provider call を route するが、product policy を所有しない。
- apps/web は user intent を render/send するが、Note/Section semantics を所有しない。
- Runtime adapter は contract と infrastructure の間を翻訳する。
- Generated OpenAPI や docs は projection であり、repository interface ではない。

## レビューチェックリスト

- domain rule は DB/API/UI なしでテストできるか。
- interface は table shape ではなく use-case need を反映しているか。
- implementation は内側の contract に依存しているか。
- read model と aggregate restoration は分離されているか。
- repository が policy shortcut になっていないか。
