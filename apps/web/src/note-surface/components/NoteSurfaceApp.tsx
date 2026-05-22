import { useNoteSurfaceFlow } from '../state/useNoteSurfaceFlow.ts';
import { CarriedContextTray } from './CarriedContextTray.tsx';
import { NoteHeader } from './NoteHeader.tsx';
import { NoteSurfaceBlocks } from './NoteSurfaceBlocks.tsx';
import { ThinRail } from './ThinRail.tsx';
import { WritingChrome } from './WritingChrome.tsx';
import { ReturnLayer } from '../../digest/components/ReturnLayer.tsx';
import { ProvenancePopover } from '../../provenance/components/ProvenancePopover.tsx';

export function NoteSurfaceApp() {
  const flow = useNoteSurfaceFlow();
  const model = flow.model;

  return (
    <div className="ann-app ann-app-shell ann-app--quiet-writing" data-ann-live-app="true" data-flow-state={flow.flowState} data-layout={model.appShell.layout}>
      <ThinRail rail={model.quietWriting.thinRail} onOpenRecentThought={flow.onOpenRecentThought} />
      <div className="ann-main" data-region="main">
        <WritingChrome chrome={model.quietWriting.writingChrome} />
        <main className="ann-note-surface" data-region="noteSurface" data-surface="single-note" data-note-id={model.noteSurface.noteHeader.noteId}>
          <NoteHeader header={model.noteSurface.noteHeader} />
          <ReturnLayer
            returnLayer={model.quietWriting.returnLayer}
            noteId={model.noteSurface.noteHeader.noteId}
            onContinueWriting={flow.onContinueWriting}
            onExpand={flow.onExpandDigest}
            onCollapse={flow.onCollapseDigest}
            onClose={flow.onCloseReturnLayer}
            onInspectSource={flow.onInspectSource}
          />
          <NoteSurfaceBlocks
            blocks={model.noteSurface.blocks}
            placeholderText={flow.placeholderText}
            onEditableFocus={flow.onEditableFocus}
            onEditableInput={flow.onEditableInput}
            onEditableBlur={flow.onEditableBlur}
            onInspectSource={flow.onInspectSource}
            onRememberMemoryCandidate={flow.onRememberMemoryCandidate}
            onRejectMemoryCandidate={flow.onRejectMemoryCandidate}
          />
          <ProvenancePopover popover={model.noteSurface.provenancePopover} onClose={flow.onCloseProvenance} />
        </main>
        <CarriedContextTray tray={model.quietWriting.carriedContextTray} onRemember={flow.onRememberMemoryCandidate} onReject={flow.onRejectMemoryCandidate} />
      </div>
    </div>
  );
}
