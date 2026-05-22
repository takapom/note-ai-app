# 統一ノートサーフェス契約

ドキュメント種別: contract  
権威: single-surface UX principle の信頼できる唯一の情報源  
オーナー: frontend surface オーナー  
付随契約: frontend-ui.md, app-note-model.md, product-principles.md  
生成済み companion: apps/web/docs/ui-surface-contract.md  
検証レーン: frontend UI review lane  
ステータス: active

## 目的

ユーザーが human layer と AI layer の間を移動しなくてよいようにする。

## この契約が所有するもの


- Single note surface principle。
- 整理由来 projection placement principle。
- 次回オープンダイジェスト surface behavior。
- MVP に persistent AI side chat がないこと。
- human layer と AI layer を primary surface として分離しないこと。


## この契約が所有しないもの


- Exact CSS tokens。
- Backend job scheduling。
- AI provider details。


## 不変条件


- AI structural output は原則として compact next-open digest として表示され、必要時のみ note surface 内の整理由来 projection として表示される。
- ユーザーは note body と AI interpretation pane を行き来しない。
- AI / agent は別ペインのチャットではなく、同じノート内の整理結果として静かに戻る。
- AI output は dismissible かつ inspectable でなければならない。
- Persistent right-side AI interpretation panel は MVP コアではない。
- Graph view は MVP コアではない。


## 許可されるトポロジー

apps/web は note model と AI operations を unified blocks としてレンダリングする。

## 移行用の seam

temporary inspector は debugging のためにのみ存在してよく、primary UX になってはならない。

## 削除対象

new contract なしに導入された permanent AI side panels を削除する。

## ガード / 検証

layer-splitting UX がないか UI diffs をレビューする。
