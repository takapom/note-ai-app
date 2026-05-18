# Aggregate 設計パターン - Python

`../_shared/ai-native-note-bounded-contexts.md` を読んだ後にだけ、これらの例を使う。
Python はこのリポジトリの主要な実装言語ではないが、tool、fixture、analysis script を書くときにこの pattern が役立つ。

## 凍結データの Aggregate

immutable tuple と `dataclass(frozen=True)` を使う。生成と `replace()` の両方が invariant check を通るように、`__post_init__` で validate する。

```python
from __future__ import annotations

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class StructureJob:
    id: str
    workspace_id: str
    note_id: str
    section_id: str | None
    target_scope: str
    trigger_reason: str
    context_hash: str
    status: str

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.workspace_id.strip() or not self.note_id.strip():
            raise ValueError("job identity is required")
        if self.target_scope == "note" and self.trigger_reason not in {"manual_organize", "next_open"}:
            raise ValueError("whole-note structuring needs an allowed reason")
        if self.trigger_reason == "BlockChanged":
            raise ValueError("BlockChanged must not enqueue AI structuring")

    def start(self) -> StructureJob:
        if self.status != "queued":
            raise ValueError("only queued jobs can start")
        return replace(self, status="running")
```

## 境界参照

他の aggregate は ID または source-backed snapshot として保持する。memory item や structure job の中に note document 全体を埋め込まない。

```python
@dataclass(frozen=True)
class MemoryItem:
    id: str
    note_id: str
    memory_type: str
    status: str
    content: str
    source_unit_id: str | None = None
    source_block_id: str | None = None

    def __post_init__(self) -> None:
        if self.status in {"rejected", "archived"}:
            return
        if not (self.source_unit_id or self.source_block_id or self.note_id):
            raise ValueError("memory requires source provenance")

    def activate(self) -> MemoryItem:
        if self.status not in {"candidate", "pending", "pinned"}:
            raise ValueError("only reviewable memory can become active")
        return replace(self, status="active")
```

## Operation の監査

```python
@dataclass(frozen=True)
class AuditRecord:
    id: str
    workspace_id: str
    operation_type: str
    policy: str
    status: str
    errors: tuple[str, ...]
    source_spans: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.workspace_id.strip():
            raise ValueError("audit identity is required")
        if self.policy != "blocked" and not self.source_spans:
            raise ValueError("accepted visible operations require source spans")
        if self.policy == "blocked" and self.status != "rejected":
            raise ValueError("blocked audit records must be rejected")
```

## レビューチェック

- aggregate collection には tuple を使う。
- class がすべての invariant を validate する場合だけ `replace()` を使う。
- source reference は明示する: source unit id、note id、block id、source span。
- sensitive memory の hidden activation を拒否する。
- generated docs、markdown export、task file は projection として扱う。
