---
name: domain-building-blocks
description: >-
  AI Native Note の concept が value object、entity、aggregate、domain service、policy、snapshot、projection のどれかを判断するときに使う。
  Note/Section/Block、StructureJob、ContextEnvelope、MemoryItem、StructureOperation、AuditRecord、ApplyDecision に適用する。
---

# Domain の構成要素

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## 分類ガイド

- Value object: source span、context budget、content hash、trigger reason、confidence threshold。
- Entity: Block、Section、MemoryItem、StructureJob、AI operation audit record。
- Aggregate: Note document、StructureJob plan、ContextEnvelope、不変条件を守る OperationRouteResult。
- Domain service/policy: operation policy の分類、context assembly の選択、job dedupe。
- Projection: semantic units、assist blocks、memory candidates、generated docs。

## レビューチェックリスト

- identity は必須か、それとも value equality で十分か。
- lifecycle と status transition は誰が所有するか。
- invariant はどこで enforce されるか。
- invalid primitive が model に入り込めるか。
- projection が SoT に昇格していないか。
- domain service が、model から漏れた behavior の置き場所になっていないか。

## AI Native Note 制約

- User-authored Blocks は SoT である。
- AI structures は projections である。
- Memory は source-backed でなければならない。
- Operation policy は Context Assembly ではなく AI Operations / Operation Router に属する。
- Scheduler は timing を所有し、provider execution は所有しない。
