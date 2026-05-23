// Dependency topology guard.
// Authority: docs/contracts/repository-topology.md

const contextRoot = '^contexts/';
const appRoot = '^apps/';
const generatedProjection = '^(docs/generated|apps/workspace-api/generated)/';

module.exports = {
  forbidden: [
    {
      name: 'no-unresolved',
      severity: 'error',
      comment: 'Every static import in the cruised graph must resolve.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Cycles are architecture debt; keep this visible without blocking the first rollout.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contexts-must-not-import-apps',
      severity: 'error',
      comment: 'Repository topology: contexts own live semantics and must not depend on app/runtime details.',
      from: { path: contextRoot },
      to: { path: appRoot },
    },
    {
      name: 'contexts-must-not-import-generated-projections',
      severity: 'error',
      comment: 'Repository topology: generated artifacts are projections and never upstream authority for contexts.',
      from: { path: contextRoot },
      to: { path: generatedProjection },
    },
    {
      name: 'worker-must-not-import-web',
      severity: 'error',
      comment: 'Runtime boundary: worker code must not depend on frontend implementation.',
      from: { path: '^apps/worker/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'web-must-not-import-worker-src',
      severity: 'error',
      comment: 'UI boundary: web may call the worker API, not import worker internals.',
      from: { path: '^apps/web/' },
      to: { path: '^apps/worker/src/' },
    },
    {
      name: 'web-must-not-import-generated-api-projection',
      severity: 'error',
      comment: 'apps/web/docs/ui-surface-contract.md keeps API intent mapping dependency-free from generated projections.',
      from: { path: '^apps/web/' },
      to: { path: '^apps/workspace-api/generated/' },
    },
    {
      name: 'note-model-context-must-not-import-peer-contexts',
      severity: 'error',
      comment: 'Note Model owns document semantics and must not depend on Scheduler, Context Assembly, Memory, or AI Operations.',
      from: { path: '^contexts/note-model/' },
      to: { path: '^contexts/(scheduler|context-assembly|memory|ai-operations|topology)/' },
    },
    {
      name: 'memory-context-must-not-import-peer-contexts',
      severity: 'error',
      comment: 'Memory owns source-backed memory lifecycle and must not import other product contexts.',
      from: { path: '^contexts/memory/' },
      to: { path: '^contexts/(note-model|scheduler|context-assembly|ai-operations|topology)/' },
    },
    {
      name: 'scheduler-context-only-imports-note-model',
      severity: 'error',
      comment: 'Repository topology permits Scheduler -> Note Model for section snapshots only.',
      from: { path: '^contexts/scheduler/' },
      to: { path: '^contexts/(context-assembly|memory|ai-operations|topology)/' },
    },
    {
      name: 'context-assembly-only-imports-note-model-and-memory',
      severity: 'error',
      comment: 'Repository topology permits Context Assembly -> Note Model and Memory only.',
      from: { path: '^contexts/context-assembly/' },
      to: { path: '^contexts/(scheduler|ai-operations|topology)/' },
    },
    {
      name: 'ai-operations-only-imports-note-model-and-memory',
      severity: 'error',
      comment: 'Repository topology permits AI Operations -> Note Model and Memory vocabulary only.',
      from: { path: '^contexts/ai-operations/' },
      to: { path: '^contexts/(scheduler|context-assembly|topology)/' },
    },
    {
      name: 'topology-context-must-not-import-product-contexts',
      severity: 'error',
      comment: 'Topology live contract should project topology edges, not depend on product context implementations.',
      from: { path: '^contexts/topology/' },
      to: { path: '^contexts/(note-model|scheduler|context-assembly|memory|ai-operations)/' },
    },
    {
      name: 'ai-operation-runtime-must-not-import-note-sot-write-adapters',
      severity: 'error',
      comment: 'Repository topology: AI runtime/projection paths must not create a direct AI-to-Note/Section/Block SoT write edge.',
      from: { path: '^apps/worker/src/ai-operations/' },
      to: { path: '^apps/worker/src/note-model/(noteDocument|noteBlockCommand)' },
    },
    {
      name: 'shared-ui-must-not-import-product-features',
      severity: 'error',
      comment: 'Shared UI stays generic and must not become a shortcut owner for product semantics.',
      from: { path: '^apps/web/src/shared-ui/' },
      to: { path: '^apps/web/src/(note-surface|digest|provenance|ai-assist|memory|runtime|noteSurface)' },
    },
  ],
  options: {
    includeOnly: {
      path: '^(apps|contexts)/',
    },
    exclude: {
      path: '(^|/)(\\.next|\\.next-[^/]+|node_modules|dist|build|coverage)(/|$)',
    },
    doNotFollow: {
      path: ['node_modules', '\\.css$'],
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    reporterOptions: {
      archi: {
        collapsePattern: '^(apps/[^/]+|contexts/[^/]+)',
      },
      dot: {
        collapsePattern: '^(apps/[^/]+|contexts/[^/]+)',
      },
      mermaid: {
        minify: false,
      },
    },
  },
};
