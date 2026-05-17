---
name: ddd-module-pattern
description: >-
  DDD のドメイン層モジュール構成をレビューするときに使う。entities、value-objects、services、
  repositories のような技術駆動パッケージングを避け、ユビキタス言語、境界づけられたコンテキスト、
  集約、変更理由に沿ったパッケージへ整理する。
---

# DDD Module Pattern

ドメイン層の module name はユビキタス言語の一部である。技術分類でフォルダを切らない。

## 判断フロー

1. 現在の package/folder 名が技術分類かドメイン概念か確認する。
2. 一緒に変更されるドメイン概念を集める。
3. 集約、値オブジェクト、ドメインサービスをドメイン概念の近くに置く。
4. 共有したいだけの型を安易に shared に出さない。
5. 境界を越えるなら明示的な contract、event、port にする。

## Bad

```text
domain/
  entities/
  value-objects/
  services/
```

## Good

```text
domain/
  ordering/
  billing/
  inventory/
```

## アンチパターン

- `entities/` に無関係なエンティティが集まる。
- `services/` がドメイン判断のゴミ箱になる。
- `shared/` が所有権不明の型置き場になる。
- package 構成が DB schema や UI route に従っている。

## レビューチェックリスト

- module 名はドメインの言葉か。
- 同じ module 内の型は変更理由を共有しているか。
- 技術分類フォルダが domain 層に出ていないか。
- shared に出した型の所有者が明確か。
- 後続レイヤーがドメイン module の境界を尊重しているか。

## 関連 skill

- `aggregate-design`
- `repository-placement`
- `domain-model-extractor`
