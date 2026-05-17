# 変更所有権契約

ドキュメント種別: contract  
権威: ownership assignment の信頼できる唯一の情報源  
オーナー: アーキテクチャオーナー  
付随契約: authority-graph.md, repository-topology.md  
生成済み companion: docs/generated/register.md  
検証レーン: ownership レビューレーン  
ステータス: active

## 目的

file proximity ではなく reason-to-change によって変更を owners に割り当てる。

## この契約が所有するもの


- オーナー選定ルール。
- 複数の owners が妥当に見える場合の escalation path。
- 多くの consumers が使用しているという理由だけでは、shared packages は invariants を所有できないというルール。


## この契約が所有しないもの


- tooling により生成される individual file ownership。
- Project management status。


## 不変条件


変更は、その変更によって language、lifecycle、invariant、consistency boundary が無効化される owner に属する。変更理由が UI wording であれば app-local UI contract が所有する。block の意味を変更するなら note model context が所有する。AI が構造化するタイミングを変更するなら lifecycle contract が所有する。


## 許可されるトポロジー

オーナー契約 -> live contract -> 実装.

## 移行用の seam

変更が複数の owners にまたがる場合は、task を分割するか、先に architecture plan を要求する。

## 削除対象

route または package location だけに基づく owner selection を削除する。

## ガード / 検証

すべての Codex task は owner contract を明示しなければならない。
