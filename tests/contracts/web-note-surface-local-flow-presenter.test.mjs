import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalNoteSurfaceSettingsStatus,
  createLocalNoteSurfaceViewModel,
  resolveLocalNoteSurfaceFlowState,
} from '../../apps/web/src/note-surface/state/localNoteSurfaceFlowPresenter.ts';

const baseNote = {
  id: 'local_note_001',
  title: 'Local note',
  updatedLabel: '保存済み',
  organizedResultReady: false,
  blocks: [
    { id: 'block_001', type: 'paragraph', text: '' },
  ],
};

test('local note surface flow presenter resolves write return provenance and writing states', () => {
  assert.equal(resolveLocalNoteSurfaceFlowState({
    activeNote: baseNote,
    returnLayerOpen: false,
    provenanceOpen: false,
  }), 'write');
  assert.equal(resolveLocalNoteSurfaceFlowState({
    activeNote: {
      ...baseNote,
      blocks: [{ id: 'block_001', type: 'paragraph', text: 'Working note' }],
    },
    returnLayerOpen: false,
    provenanceOpen: false,
  }), 'writing');
  assert.equal(resolveLocalNoteSurfaceFlowState({
    activeNote: baseNote,
    returnLayerOpen: true,
    provenanceOpen: false,
  }), 'return');
  assert.equal(resolveLocalNoteSurfaceFlowState({
    activeNote: baseNote,
    returnLayerOpen: true,
    provenanceOpen: true,
  }), 'provenance');
});

test('local note surface flow presenter creates settings status from local draft readiness', () => {
  assert.deepEqual(createLocalNoteSurfaceSettingsStatus({
    activeNote: baseNote,
    hydrated: false,
  }), {
    localDraftStatus: '読み込み中',
    digestStatus: '整理待ちはありません',
  });

  assert.deepEqual(createLocalNoteSurfaceSettingsStatus({
    activeNote: {
      ...baseNote,
      organizedResultReady: true,
      blocks: [{ id: 'block_001', type: 'paragraph', text: 'Ready for digest' }],
    },
    hydrated: true,
  }), {
    localDraftStatus: 'ローカル保存中',
    digestStatus: '次に戻る入口があります',
  });
});

test('local note surface flow presenter creates the demo view model without backend ownership', () => {
  const model = createLocalNoteSurfaceViewModel({
    activeNote: {
      ...baseNote,
      blocks: [{ id: 'block_001', type: 'paragraph', text: 'A thought about quiet writing.' }],
    },
    aiStatus: 'structuring',
    editingBlockIds: ['block_001'],
    digestAvailable: true,
    returnLayerOpen: true,
    provenanceOpen: true,
    memoryCandidatesVisible: false,
    recentThoughts: [{
      id: 'local_note_001',
      title: 'Local note',
      updatedLabel: '保存済み',
      active: true,
    }],
  });

  assert.equal(model.topBar.workspaceName, 'ANN');
  assert.equal(model.topBar.aiStatus, 'structuring');
  assert.equal(model.quietWriting.thinRail.recentThoughts[0]?.active, true);
  assert.equal(model.noteSurface.nextOpenDigest.available, true);
  assert.equal(model.quietWriting.returnLayer.available, false);
  assert.equal(model.noteSurface.provenancePopover.open, true);
  assert.equal(model.excludedSurfaces.persistentChatPanel, false);
});
