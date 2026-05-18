# データモデル契約

ドキュメント種別: contract  
権威: MVP 永続データ形状の信頼できる唯一の情報源  
オーナー: note-model コンテキストオーナー  
付随契約: app-note-model.md, operation-return-contract.md, memory.md, backend-runtime.md  
生成済み companion: contexts/note-model/src/contract/noteContract.ts  
検証レーン: note model schema テスト + runtime persistence review  
ステータス: active

## 目的

AI ネイティブノートの内部正本、派生構造、操作履歴、provenance を、実装前に矛盾のない論理データモデルとして固定する。

## この契約が所有するもの

- MVP の論理エンティティと必須フィールド。
- user-authored data と AI-derived projection の境界。
- Turso に保存される canonical data と Agent-local SQL の一時 state の境界。
- schema tests が保証すべき識別子、origin、status、hash、provenance の最小要件。

## この契約が所有しないもの

- 具体的な migration runner。
- index tuning、partitioning、connection pool などの運用最適化。
- UI 表示順の詳細。
- provider-specific AI payload。

## 不変条件

- `notes` は `id`, `workspace_id`, `title`, `description_user`, `description_ai`, `description_ai_approved`, `description_effective`, `created_at`, `updated_at` を持つ。
- `sections` は `note_id`, `parent_section_id`, `heading_block_id`, `heading_level`, `title`, `description_ai`, `content_hash`, `last_structured_hash`, `last_structured_at`, `position` を持つ。
- Scheduler section snapshot は canonical `sections` の read projection である。scheduler planning のために Agent-local dirty tracking から `isDirty` を overlay してよいが、この overlay は canonical section data ではなく、adapter は `notes`、`sections`、`blocks` を create/update してはならない。
- `blocks` は `note_id`, `section_id`, `parent_block_id`, `type`, `content_json`, `plain_text`, `position`, `origin`, `content_hash` を持つ。
- block `origin` は `user`, `ai`, `user_modified_ai`, `system` のいずれかである。
- MVP の user block type は `paragraph`, `heading`, `bullet_list_item`, `numbered_list_item`, `todo`, `quote`, `code`, `divider` である。
- MVP の AI block type は `ai_summary`, `ai_question`, `ai_decision`, `ai_related_context`, `ai_memory_candidate` である。
- `edit_events` は user edit の証跡であり、AI structure の正本ではない。
- `structure_jobs` は `target_scope`, `trigger_reason`, `context_hash`, `status`, `priority` を持つ。
- `trigger_reason` は `note_closed`, `tab_switched`, `app_left`, `next_open`, `manual_organize` のいずれかである。
- `semantic_units` と `semantic_edges` は AI-derived projection であり、user blocks を置き換えない。
- `semantic_unit_section_summaries` と `semantic_unit_structure_snapshots` は Context Assembly の local structure input 用 projection であり、canonical Note/Section/Block data ではない。
- `semantic_unit_related_candidates` は Context Assembly の related context input 用 read projection であり、related semantic_units、note card IDs、explicit source block excerpt relation を束ねるが、full note / full workspace data を保持または返却してはならない。
- `memory_items` は source reference と status を持ち、source のない memory を active にしてはならない。
- `ai_operations` は generated operation の audit record であり、Operation Router を経由せずに適用してはならない。
- `ai_operations.id` は runtime/application boundary が routing 前に供給した stable operation audit ID であり、Operation Router が生成した placeholder、sentinel、または blank ID であってはならない。
- `source_spans` は `target_type`, `target_id`, `source_block_id`, `start_offset`, `end_offset`, `reason` を持つ。
- AI operation audit record の `source_spans.target_id` は、同じ routing 結果の `ai_operations.id` を参照する。
- Runtime persistence は duplicate `ai_operations.id` を上書きせず拒否する。

## 許可されるトポロジー

UI/editor events -> note model contract -> persistence schema -> scheduler/context/operation projections。  
Turso は canonical DB として notes、sections、blocks、semantic_units、semantic_edges、memory_items、ai_operations、source_spans を保存する。  
Agent-local SQL は current session、dirty tracking、pending jobs、retry queue のみを保存する。

## 移行用の seam

初期 scaffold では migration file が未作成でもよいが、live TypeScript contract と schema fixture はこの論理モデルに収束しなければならない。

## 削除対象

Markdown string、AI free-form text、または Agent-local SQL を canonical note data として扱う実装を削除する。

## ガード / 検証

schema tests は block origin、block type、trigger_reason、source_spans、memory status、operation audit record の不変条件を検証しなければならない。
runtime persistence tests は Operation Router 由来の audit record が `ai_operations` と `source_spans` に mapping され、policy/status が persistence layer で再分類されないことを検証しなければならない。
