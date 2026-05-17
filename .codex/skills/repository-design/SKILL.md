---
name: repository-design
description: >-
  AI Native Note の aggregate と projection の persistence API を設計するときに使う:
  Note、Section、Block、StructureJob、MemoryItem、AI operation audit records、semantic units、read models。
---

# Repository 設計

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

repository は owner contract に従って aggregate または projection を永続化する。product policy を所有したり、隠れた cross-context decision を実行したりしてはいけない。

## 設計チェック

- repository は table、DTO、screen ではなく aggregate または use case port で名付ける。
- command method は aggregate を保存し、query service は read model を返す。
- repository method は operation classification、AI context assembly、trigger decision、memory policy activation を行ってはいけない。
- persistence mapping は許可されるが、product invariant は live contract に置く。
- AI operation を適用する前に必ず Operation Router を通過する。

## Turso 境界

Turso は notes、sections、blocks、semantic units、memory items、ai_operations、source_spans の canonical persistent data である。agent-local SQL は一時状態に限る。

## 警戒サイン

- repository が 1 つの隠れた transaction で複数 aggregate を作る。
- repository が DTO を返し、caller がそれを aggregate として扱う。
- repository が generated docs や Superset task state を behavior authority として読む。
- repository が source provenance / policy なしに memory を activate する。
