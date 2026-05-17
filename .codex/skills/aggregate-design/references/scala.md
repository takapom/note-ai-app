# Aggregate 設計パターン - Scala

`../_shared/ai-native-note-bounded-contexts.md` を読んだ後にだけ、これらの例を使う。
Scala はこのリポジトリの主要な実装言語ではないが、immutable aggregate design を評価するときにこの pattern が役立つ。

## Private Case Class とスマートコンストラクタ

immutable collection を使い、companion constructor で validate する。

```scala
final case class NoteDocument private (
  noteId: String,
  workspaceId: String,
  sections: Vector[SectionSnapshot],
  blocks: Vector[BlockSnapshot]
) {
  def markSectionDirty(sectionId: String, contentHash: String): NoteDocument =
    copy(sections = sections.map { section =>
      if (section.id == sectionId) section.copy(contentHash = contentHash, isDirty = true)
      else section
    })
}

object NoteDocument {
  def create(
    noteId: String,
    workspaceId: String,
    sections: Vector[SectionSnapshot],
    blocks: Vector[BlockSnapshot]
  ): Either[String, NoteDocument] =
    if (noteId.trim.isEmpty || workspaceId.trim.isEmpty) Left("note identity is required")
    else if (!sections.forall(_.noteId == noteId)) Left("sections must belong to note")
    else if (!blocks.forall(_.noteId == noteId)) Left("blocks must belong to note")
    else Right(NoteDocument(noteId, workspaceId, sections, blocks))
}
```

## 状態遷移の境界

```scala
final case class StructureJob private (
  id: String,
  noteId: String,
  sectionId: Option[String],
  triggerReason: String,
  contextHash: String,
  status: String
) {
  def start: Either[String, StructureJob] =
    if (status == "queued") Right(copy(status = "running"))
    else Left("only queued jobs can start")
}

object StructureJob {
  def create(
    id: String,
    noteId: String,
    sectionId: Option[String],
    triggerReason: String,
    contextHash: String
  ): Either[String, StructureJob] =
    if (id.trim.isEmpty || noteId.trim.isEmpty || contextHash.trim.isEmpty) Left("job identity is required")
    else if (triggerReason == "BlockChanged") Left("BlockChanged must not enqueue AI structuring")
    else Right(StructureJob(id, noteId, sectionId, triggerReason, contextHash, "queued"))
}
```

## レビューチェック

- invalid input には `Either` または同等の result type を使う。
- `Vector`、`List`、その他の immutable collection を使う。
- `copy` で無関係な field を保つ。
- accepted router output を構築する前に source spans、confidence、target identity、allowed status transition を validate する。
- generated markdown、issue text、Superset task content は aggregate authority の外に置く。
