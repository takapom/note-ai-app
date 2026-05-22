export * from './note-surface/viewModelTypes.ts';
export * from './note-surface/viewModelConstants.ts';
export {
  createNoteSurfaceViewModel,
  refreshQuietWritingProjection,
  withInlineBlockActionState,
  withReturnLayerActionState,
  withReturnLayerOpen,
} from './note-surface/noteSurfacePresenter.ts';
export * from './digest/digestPresenter.ts';
export * from './provenance/provenancePresenter.ts';
export * from './note-surface/focusPresenter.ts';
import { validateNoteDocumentContract } from '../../../contexts/note-model/src/contract/noteContract.ts';

export function validateNoteSurfaceDocument(document: unknown): readonly string[] {
  return validateNoteDocumentContract(document).errors;
}
