# 移行用 seam 契約

ドキュメント種別: contract  
権威: 許可される temporary gaps の信頼できる唯一の情報源  
オーナー: アーキテクチャオーナー  
付随契約: mvp-scope.md, authority-graph.md  
生成済み companion: docs/generated/register.md  
検証レーン: seam review lane  
ステータス: active

## 目的

bridges、dual-write、fallback、compatibility paths が default architecture になることを防ぐ。

## この契約が所有するもの


- Allowed temporary seams。
- bridge/fallback use の criteria。
- Removal requirements。


## この契約が所有しないもの


- approved seams の implementation details。


## 不変条件


- Direct replacement は bridge/fallback より優先される。
- Dual-read/write はデフォルトで許可されない。
- すべての seam は owner、reason、risk、removal condition、Superset task を明示しなければならない。
- seam は ownership を再定義してはならない。


## 許可されるトポロジー

Target model -> implementation convergence. Seams は追跡される exceptions である。

## 移行用の seam

この契約は seam permission 自体を所有する。

## 削除対象

untracked compatibility paths を削除する。

## ガード / 検証

undeclared compatibility code がないか PRs をレビューする。
