# メモリ契約

ドキュメント種別: contract  
権威: app memory semantics の信頼できる唯一の情報源  
オーナー: memory context オーナー  
付随契約: operation-return-contract.md, context-assembly.md, security-privacy.md  
生成済み companion: contexts/memory/src/contract/memoryContract.ts  
検証レーン: memory schema + provenance tests  
ステータス: active

## 目的

memory を hidden profiling ではなく、source-backed で editable な projection として定義する。

## この契約が所有するもの


- Memory item types。
- Memory status lifecycle。
- User approval semantics。
- Source provenance requirement。


## この契約が所有しないもの


- Semantic unit extraction details。
- memory candidate blocks の UI design。
- External integration memory use。


## 不変条件


- MVP memory types: unresolved_question, past_decision, interest_theme.
- MVP memory types は `unresolved_question`, `past_decision`, `interest_theme` である。
- Memory statuses は `candidate`, `pending`, `active`, `pinned`, `rejected`, `archived` である。
- Memory は source_unit_id、source_note_id、source_span のいずれか必要な source reference を持たなければならない。
- Memory candidate は、別 dashboard だけでなく、ノート内の AI Memory Candidate Block として提示できなければならない。
- Memory candidate の user actions は 覚える、編集、違う、削除、保留 である。
- Sensitive/profile-like memory は user approval なしに active になれない。
- Deleted/rejected memory は将来の context に使用してはならない。


## 許可されるトポロジー

AI operations が メモリ候補 を作成し、user action または policy が有効化し、context assembly が active memory を利用する。

## 移行用の seam

明示的に許可された low-risk app metadata を除き、MVP では automatic active memory は許可されない。

## 削除対象

hidden user-profiling memory を削除する。

## ガード / 検証

Memory review tests は rejected memory が context から除外されることを保証しなければならない。
