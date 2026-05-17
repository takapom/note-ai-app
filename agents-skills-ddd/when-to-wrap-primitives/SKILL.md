---
name: when-to-wrap-primitives
description: >-
  string、number、boolean などの primitive をドメイン固有型で包むべきか判断するときに使う。
  Primitive Obsession と過剰な Value Object 化の両方を避け、ID、Email、Money、Name、DateRange、
  Status などを型にすべきか、primitive のままでよいかをレビューする。
---

# When To Wrap Primitives

primitive を包む判断は信仰ではなく、得られる保守性と認知負荷の差で決める。

## 判断フロー

1. 不変条件があるなら包む。
2. 同じ primitive 型の取り違えリスクがあるなら包む。特に ID は強く推奨する。
3. その値に属するドメイン操作があるなら包む。
4. 複数の値が不可分なら複合型にする。
5. すべて該当せず、1箇所だけで使うなら primitive のままでよい。

## ラップの段階

- 軽量型: 取り違え防止が目的。branded type、newtype、type alias を使う。
- 構築時検証型: 不変条件が目的。Smart Constructor を使う。
- 振る舞い付き型: 計算、比較、変換などドメイン操作も閉じ込める。

## アンチパターン

- すべてを `string` にして、前提をコメントに書く。
- 何の制約も振る舞いもない wrapper を大量に作る。
- `CustomerName` と `ShippingName` のように同じ意味の型を文脈だけで増やす。
- 型変換のボイラープレートがドメインロジックより多い。

## レビューチェックリスト

- 同じ primitive 引数が並んでいないか。
- 単位、通貨、ID、範囲、空文字の制約が primitive に漏れていないか。
- 包む理由を不変条件、取り違え防止、操作集約のいずれかで説明できるか。
- 過剰な wrapper がチームの認知負荷を上げていないか。

## 関連 skill

- `domain-primitives-and-always-valid`
- `domain-building-blocks`
