# AI 構造化ライフサイクル契約

ドキュメント種別: contract  
権威: AI がノートを構造化するタイミングの信頼できる唯一の情報源  
オーナー: 構造化ライフサイクルオーナー  
付随契約: app-note-model.md, context-assembly.md, operation-return-contract.md  
生成済み companion: contexts/scheduler/src/contract/structureSchedulerContract.ts  
検証レーン: 構造化スケジューラーテスト  
ステータス: active

## 目的

キー入力ごとの構造化を防ぎ、MVP のトリガーを定義する。

## この契約が所有するもの


- 構造化トリガー。
- dirty scope と context_hash dedupe のライフサイクル。
- 安定した section / note 離脱時の振る舞い。
- 次回オープンダイジェスト の振る舞い。


## この契約が所有しないもの


- AI 操作スキーマの詳細。
- digest の UI スタイリング。
- プロバイダー選択。


## 不変条件


- AI structuring はキー入力ごとに実行してはならない。
- BlockChanged は blocks を保存し、edit event を記録し、dirty scope をマークし、必要なら lightweight index を更新するだけである。
- MVP の主要トリガーは note close / tab switch / app leave である。
- 次回オープン時には取りこぼした structure job を復旧し、digest candidate を表示する。
- manual organize は明示的なユーザー意図として許可される。
- note close flow は latest blocks save、note session ended、dirty sections discovery、structure job enqueue、background structuring、operations saved/applied、next open digest prepared の順序で進む。
- 構造化対象は section を基本とする。block は小さすぎ、workspace は retrieval 対象であって直接構造化対象ではない。
- whole note は note description / summary 生成または manual organize の場合にのみ許可される。
- 各 section は content_hash、last_structured_hash、last_structured_at、is_dirty を持つ。
- 構造化は `content_hash != last_structured_hash` の section のみ対象にする。
- structure job は context_hash を持ち、同じ context_hash の成功済み job を再実行しない。


## 許可されるトポロジー

Editor events -> scheduler -> structure job -> context assembly -> AI engine -> operation router.

## 移行用の seam

hash / embedding / stale flag のための idle indexing は存在してよいが、可視の AI structuring のためには使わない。

## 削除対象

raw keypress handler 内の LLM 呼び出しを削除する。

## ガード / 検証

テストは BlockChanged が AI を直接呼び出さないことを示さなければならない。
