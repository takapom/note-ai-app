# 信頼できる唯一の情報源 と Projection 契約

ドキュメント種別: contract  
権威: SoT/projection separation の Policy  
オーナー: アーキテクチャオーナー  
付随契約: authority-graph.md, documentation-system.md  
生成済み companion: docs/generated/register.md  
検証レーン: contract drift review lane  
ステータス: active

## 目的

projected artifacts が偶発的な policy になることを防ぐ。

## この契約が所有するもの


- SoT、projection、evidence、trace の定義。
- TypeScript contract files が live semantics になる場合のルール。
- OpenAPI が generated projection になる場合のルール。


## この契約が所有しないもの


- Specific schema fields。
- UI component behavior。
- Runtime deployment details。


## 不変条件


- SoT は reason to change を所有する。
- projection は SoT が変更されたときに再生成または置換できる。
- Generated docs は machine-owned であるか、snapshot として明示的にマークされなければならない。
- GitHub/Superset/PR artifacts は traceability surfaces であり、decision authorities ではない。


## 許可されるトポロジー

SoT -> live contract -> implementation -> generated evidence -> traceability.

## 移行用の seam

Bridge artifacts は direct replacement が許容できない risk を生む場合にのみ許可される。bridges には removal task が必要である。

## 削除対象

overlapping ownership を持つ fallback SoTs を削除する。

## ガード / 検証

SoT を更新せず projection を更新する変更は、SoT が変更されなかった理由を説明しなければならない。
