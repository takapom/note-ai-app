# Aggregate 設計パターン - Rust

`../_shared/ai-native-note-bounded-contexts.md` を読んだ後にだけ、これらの例を使う。
Rust はこのリポジトリの主要な実装言語ではないが、strict domain library や command-line verification tool にはこの pattern を適用できる。

## スマートコンストラクタ

field は private にし、`Result` を返す constructor を公開する。

```rust
pub struct ContextEnvelope {
    target_source_block_ids: Vec<String>,
    active_memory_ids: Vec<String>,
    max_context_characters: usize,
}

#[derive(Debug)]
pub enum ContextEnvelopeError {
    MissingTargetSource,
    EmptyBudget,
}

impl ContextEnvelope {
    pub fn create(
        target_source_block_ids: Vec<String>,
        active_memory_ids: Vec<String>,
        max_context_characters: usize,
    ) -> Result<Self, ContextEnvelopeError> {
        if target_source_block_ids.is_empty() {
            return Err(ContextEnvelopeError::MissingTargetSource);
        }
        if max_context_characters == 0 {
            return Err(ContextEnvelopeError::EmptyBudget);
        }

        Ok(Self {
            target_source_block_ids,
            active_memory_ids,
            max_context_characters,
        })
    }

    pub fn target_source_block_ids(&self) -> &[String] {
        &self.target_source_block_ids
    }
}
```

## ID 参照

境界をまたぐ関係には ID を使う。snapshot は caller の視点で最小かつ immutable に保つ。

```rust
pub struct StructureJob {
    id: String,
    workspace_id: String,
    note_id: String,
    section_id: Option<String>,
    context_hash: String,
}
```

## 安全な状態変更

copy-on-write style では `self` を consume し、ownership が明確な場合は `&mut self` を使う。常に aggregate invariant を保つ。

```rust
pub enum ApplyAction {
    Apply,
    Propose,
    NoApply,
    Reject,
}

pub struct ApplyDecision {
    operation_id: String,
    action: ApplyAction,
    reason: String,
}

impl ApplyDecision {
    pub fn reject(operation_id: String, reason: String) -> Result<Self, String> {
        if operation_id.trim().is_empty() {
            return Err("operation id is required".to_string());
        }
        if reason.trim().is_empty() {
            return Err("decision reason is required".to_string());
        }

        Ok(Self {
            operation_id,
            action: ApplyAction::Reject,
            reason,
        })
    }
}
```

## レビューチェック

- constructor は invalid value を作らず `Result` を返す。
- public getter は mutable internal ではなく slice または copied scalar value を返す。
- cross-context reference は ID または bounded snapshot である。
- unknown operation type、missing source span、low confidence decision は reject するか no-apply decision にする。
- runtime/provider/database adapter は Note Model、Scheduler、Context Assembly、Memory、AI Operations、Operation Router policy を所有しない。
