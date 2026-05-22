import type { NoteBlockViewModel } from '../../note-surface/viewModelTypes.ts';

interface MemoryCandidateBlockProps {
  block: NoteBlockViewModel;
  onRemember(blockId: string): void;
  onReject(blockId: string): void;
}

export function MemoryCandidateBlock({ block, onRemember, onReject }: MemoryCandidateBlockProps) {
  const memoryCandidate = block.memoryCandidate;
  if (memoryCandidate === undefined) {
    return null;
  }

  return (
    <section className="ann-memory-candidate-block" data-inline-memory-candidate="true" data-block-origin="ai">
      <div className="ann-inline-label" aria-label="整理由来">{memoryCandidate.label}</div>
      <div className="ann-block-text" role="textbox" aria-readonly="false" contentEditable suppressContentEditableWarning>{block.text}</div>
      {block.sourcePreview === undefined ? null : <p className="ann-memory-candidate-block__source">{block.sourcePreview}</p>}
      <div className="ann-inline-actions" data-action-group="memory_candidate">
        <button type="button" data-action="remember" data-target="memory_candidate_block" data-block-id={block.id} onClick={() => onRemember(block.id)}>覚える</button>
        <button type="button" data-action="edit" data-target="memory_candidate_block" data-block-id={block.id}>編集</button>
        <button type="button" data-action="reject" data-target="memory_candidate_block" data-block-id={block.id} onClick={() => onReject(block.id)}>違う</button>
        <button type="button" data-action="delete" data-target="memory_candidate_block" data-block-id={block.id} onClick={() => onReject(block.id)}>削除</button>
        <button type="button" data-action="snooze" data-target="memory_candidate_block" data-block-id={block.id} onClick={() => onReject(block.id)}>保留</button>
      </div>
    </section>
  );
}
