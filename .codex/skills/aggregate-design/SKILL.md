---
name: aggregate-design
description: >-
  AI Native Note の bounded context で aggregate 境界を設計またはレビューするときに使う:
  Note、Section、Block、StructureJob、ContextEnvelope、MemoryItem、AI Operation、Operation Router の audit record。
  実装前に真の不変条件、aggregate root、ID reference、always-valid 境界を確認する。
---

# Aggregate 設計

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

言語別の aggregate 実装例が必要な場合だけ、該当する参照を読む:
references/typescript.md、references/python.md、references/rust.md、references/scala.md。

skill 評価用 fixture は evals/evals.json と evals/trigger-eval.json を参照する。

## リポジトリ固有ルール

aggregate はテーブル、画面、API response、生成ドキュメントではない。このリポジトリでは、aggregate 境界は owner contract、ライフサイクル、不変条件、一貫性境界で説明できなければならない。

## 代表的な Aggregate 候補

- Note Model: Note は内部ドキュメント semantics として Sections/Blocks を所有する。
- Scheduler: StructureJob は trigger reason、target scope、contextHash、status、priority を所有する。
- Context Assembly: ContextEnvelope は bounded AI input、budget、K limits、trust boundary を所有する。
- Memory: MemoryItem は type、status、source provenance、activation eligibility を所有する。
- AI Operations: StructureOperation は operation shape、source spans、confidence を所有する。
- Operation Router: AuditRecord と ApplyDecision は安全な route outcome を所有する。

## レビューチェックリスト

- aggregate を判断する前に owner contract を特定する。
- 1 つの command 直後に必ず成立すべき真の不変条件を列挙する。
- 空 ID、未設定 workspace ID、NaN timestamp、sentinel string のような偽の identity を拒否する。
- 他の aggregate は、直接変更可能な参照ではなく ID または snapshot として保持する。
- UI、DB schema、generated docs、Superset task の形に aggregate を定義させない。
- 一貫性が context をまたぐ場合は、直接 mutation より operation/audit/event/result 境界を優先する。
- テストでは不正入力を作り、それが有効な aggregate になれないことを証明する。

## AI Native Note の落とし穴

- AI semantic units を user-authored Blocks の置き換えとして扱う。
- Context Assembly に Operation Router policy を所有させる。
- Scheduler が BlockChanged で AI を呼ぶ。
- Operation Router が log shape を保つために不正な audit records を作る。
