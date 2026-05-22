import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const webSourceRoot = new URL('apps/web/src/', root);

const expectedBootstrapPath = 'apps/web/src/noteSurfaceAppBootstrap.ts';
const expectedProductAppPath = 'apps/web/src/noteSurfaceProductApp.ts';
const expectedProductStatePath = 'apps/web/src/noteSurfaceProductState.ts';
const expectedResolverOptionsFromDocumentPath = 'apps/web/src/noteSurfaceResolverOptionsFromDocument.ts';
const expectedHttpProductProviderPath = 'apps/web/src/noteSurfaceHttpProductProvider.ts';
const expectedHttpDigestProductProviderPath = 'apps/web/src/noteSurfaceHttpDigestProductProvider.ts';
const expectedHttpProductAppPath = 'apps/web/src/noteSurfaceHttpProductApp.ts';
const expectedHttpDigestProductAppPath = 'apps/web/src/noteSurfaceHttpDigestProductApp.ts';
const expectedSessionLifecyclePath = 'apps/web/src/noteSurfaceSessionLifecycle.ts';

const guardedSourcePaths = [
  'apps/web/src/noteSurface.ts',
  'apps/web/src/noteSurfaceActionInputResolver.ts',
  'apps/web/src/noteSurfaceApiIntents.ts',
  'apps/web/src/noteSurfaceApiTransport.ts',
  'apps/web/src/noteSurfaceBrowserRuntime.ts',
  'apps/web/src/noteSurfaceDomHost.ts',
  'apps/web/src/noteSurfaceEventController.ts',
  'apps/web/src/noteSurfaceHtmlRenderer.ts',
  'apps/web/src/noteSurfaceAuthoringShortcuts.ts',
  expectedProductStatePath,
  expectedResolverOptionsFromDocumentPath,
  expectedHttpProductProviderPath,
  expectedHttpDigestProductProviderPath,
  expectedHttpProductAppPath,
  expectedHttpDigestProductAppPath,
  expectedSessionLifecyclePath,
  expectedProductAppPath,
  expectedBootstrapPath,
];

const domOwnerPath = 'apps/web/src/noteSurfaceDomHost.ts';
const transportOwnerPath = 'apps/web/src/noteSurfaceApiTransport.ts';

const forbiddenRuntimeBoundaryPatterns = [
  {
    name: 'Worker runtime import',
    pattern: /from\s+['"][^'"]*(?:apps\/worker|\.\.\/worker|worker\/src)[^'"]*['"]/,
  },
  {
    name: 'generated OpenAPI or projection import',
    pattern: /from\s+['"][^'"]*(?:workspace-api\/generated|\/generated\/|generated)[^'"]*['"]/,
  },
  {
    name: 'AI provider SDK import',
    pattern: /from\s+['"][^'"]*(?:ai-sdk|openai|anthropic|google|mistral|cohere)[^'"]*['"]/i,
  },
  {
    name: 'auth provider SDK import',
    pattern: /from\s+['"][^'"]*(?:clerk|auth0|firebase|supabase|next-auth|lucia|jsonwebtoken|jose)[^'"]*['"]/i,
  },
  {
    name: 'auth policy shortcut',
    pattern: /\b(?:verifyJwt|verifyToken|decodeJwt|createAuthClient|authProvider|authPolicy|workspaceMembership)\b/i,
  },
  {
    name: 'provider adapter shortcut',
    pattern: /\b(?:providerAdapter|callProvider|createProvider|externalAction)\b/i,
  },
  {
    name: 'global fetch call',
    pattern: /\b(?:globalThis\.fetch|window\.fetch|fetch\s*\()/,
  },
  {
    name: 'browser request constructor',
    pattern: /\b(?:XMLHttpRequest|new\s+Request\s*\()/,
  },
  {
    name: 'AI/user-authored block direct mutation flag',
    pattern: /\b(?:mutatesUserAuthoredBlock|mutateUserAuthoredBlock|directUserBlockMutation)\s*[:=]\s*true\b/i,
  },
  {
    name: 'canonical block field assignment',
    pattern: /\b(?:block|userBlock|userAuthoredBlock)\.(?:contentJson|plainText|origin|type|position|sectionId)\s*=(?!=|>)/,
  },
  {
    name: 'canonical document collection mutation',
    pattern: /\b(?:document|noteDocument)\.(?:blocks|sections)\.(?:push|pop|shift|unshift|splice|sort|reverse)\s*\(/,
  },
  {
    name: 'crypto UUID generation',
    pattern: /\bcrypto\.randomUUID\s*\(/,
  },
  {
    name: 'random number ID generation',
    pattern: /\bMath\.random\s*\(/,
  },
  {
    name: 'timestamp ID generation',
    pattern: /\bDate\.now\s*\(/,
  },
];

const forbiddenDomPatterns = [
  {
    name: 'document API call',
    pattern: /\bdocument\.(?:querySelector|getElementById|getElementsBy|createElement|body|head|documentElement|addEventListener|removeEventListener)\b/,
  },
  { name: 'window API', pattern: /\bwindow\./ },
  { name: 'event listener API call', pattern: /\.\s*addEventListener\s*\(/ },
  { name: 'HTML injection assignment', pattern: /\.\s*innerHTML\s*=/ },
  { name: 'query selector API call', pattern: /\.\s*querySelector\s*\(/ },
  { name: 'DOM element type', pattern: /\bHTMLElement\b/ },
];

const forbiddenExcludedSurfacePatterns = [
  {
    name: 'enabled MVP-excluded surface flag',
    pattern: /\b(?:persistentChatPanel|aiModeSwitcher|externalIntegrationsDashboard)\s*:\s*true\b/,
  },
  {
    name: 'excluded surface creator or mount path',
    pattern: /\b(?:create|render|mount|open|show)(?:PersistentChatPanel|ChatPanel|AiModeSwitcher|AiModeToggle|ExternalIntegrationsDashboard|IntegrationsDashboard)\b/,
  },
  {
    name: 'excluded surface markup hook',
    pattern: /data-(?:component|surface|region)=["'][^"']*(?:chat-panel|ai-mode|mode-switcher|integrations-dashboard|external-integration)/i,
  },
  {
    name: 'excluded surface display label',
    pattern: /\b(?:Persistent Chat|Chat Panel|AI Mode Switcher|External Integrations|Integrations Dashboard)\b/,
  },
];

test('web note surface integration guard watches expected bootstrap product app HTTP product app HTTP digest product app provider digest provider resolver and product state composition paths', async () => {
  const discoveredPaths = await discoverNoteSurfaceSourcePaths();
  const unknownDiscoveredPaths = discoveredPaths.filter((path) => !guardedSourcePaths.includes(path));
  const existingGuardedPaths = await existingPaths(guardedSourcePaths);
  const expectedOptionalPaths = [
    expectedBootstrapPath,
    expectedProductAppPath,
    expectedProductStatePath,
    expectedResolverOptionsFromDocumentPath,
    expectedHttpProductProviderPath,
    expectedHttpDigestProductProviderPath,
    expectedHttpProductAppPath,
    expectedHttpDigestProductAppPath,
    expectedSessionLifecyclePath,
  ];
  const missingRequiredPaths = guardedSourcePaths
    .filter((path) => !expectedOptionalPaths.includes(path))
    .filter((path) => !existingGuardedPaths.includes(path));
  const missingBootstrapPaths = existingGuardedPaths.includes(expectedBootstrapPath) ? [] : [expectedBootstrapPath];
  const missingProductAppPaths = existingGuardedPaths.includes(expectedProductAppPath) ? [] : [expectedProductAppPath];
  const missingProductStatePaths = existingGuardedPaths.includes(expectedProductStatePath) ? [] : [expectedProductStatePath];
  const missingResolverOptionsFromDocumentPaths = existingGuardedPaths.includes(expectedResolverOptionsFromDocumentPath)
    ? []
    : [expectedResolverOptionsFromDocumentPath];
  const missingHttpProductProviderPaths = existingGuardedPaths.includes(expectedHttpProductProviderPath)
    ? []
    : [expectedHttpProductProviderPath];
  const missingHttpDigestProductProviderPaths = existingGuardedPaths.includes(expectedHttpDigestProductProviderPath)
    ? []
    : [expectedHttpDigestProductProviderPath];
  const missingHttpProductAppPaths = existingGuardedPaths.includes(expectedHttpProductAppPath)
    ? []
    : [expectedHttpProductAppPath];
  const missingHttpDigestProductAppPaths = existingGuardedPaths.includes(expectedHttpDigestProductAppPath)
    ? []
    : [expectedHttpDigestProductAppPath];

  assert.deepEqual(missingRequiredPaths, []);
  assert.deepEqual(unknownDiscoveredPaths, []);
  assert.equal(guardedSourcePaths.includes(expectedBootstrapPath), true);
  assert.equal(guardedSourcePaths.includes(expectedProductAppPath), true);
  assert.equal(guardedSourcePaths.includes(expectedProductStatePath), true);
  assert.equal(guardedSourcePaths.includes(expectedResolverOptionsFromDocumentPath), true);
  assert.equal(guardedSourcePaths.includes(expectedHttpProductProviderPath), true);
  assert.equal(guardedSourcePaths.includes(expectedHttpDigestProductProviderPath), true);
  assert.equal(guardedSourcePaths.includes(expectedHttpProductAppPath), true);
  assert.equal(guardedSourcePaths.includes(expectedHttpDigestProductAppPath), true);
  assert.deepEqual(
    missingBootstrapPaths,
    discoveredPaths.includes(expectedBootstrapPath) ? [] : [expectedBootstrapPath],
  );
  assert.deepEqual(
    missingProductAppPaths,
    discoveredPaths.includes(expectedProductAppPath) ? [] : [expectedProductAppPath],
  );
  assert.deepEqual(
    missingProductStatePaths,
    discoveredPaths.includes(expectedProductStatePath) ? [] : [expectedProductStatePath],
  );
  assert.deepEqual(
    missingResolverOptionsFromDocumentPaths,
    discoveredPaths.includes(expectedResolverOptionsFromDocumentPath) ? [] : [expectedResolverOptionsFromDocumentPath],
  );
  assert.deepEqual(
    missingHttpProductProviderPaths,
    discoveredPaths.includes(expectedHttpProductProviderPath) ? [] : [expectedHttpProductProviderPath],
  );
  assert.deepEqual(
    missingHttpDigestProductProviderPaths,
    discoveredPaths.includes(expectedHttpDigestProductProviderPath) ? [] : [expectedHttpDigestProductProviderPath],
  );
  assert.deepEqual(
    missingHttpProductAppPaths,
    discoveredPaths.includes(expectedHttpProductAppPath) ? [] : [expectedHttpProductAppPath],
  );
  assert.deepEqual(
    missingHttpDigestProductAppPaths,
    discoveredPaths.includes(expectedHttpDigestProductAppPath) ? [] : [expectedHttpDigestProductAppPath],
  );
});

test('web note surface integration sources stay outside runtime provider generated and direct mutation boundaries', async () => {
  const sources = await readExistingGuardedSources();

  for (const source of sources) {
    assertNoForbiddenPatterns(source, forbiddenRuntimeBoundaryPatterns);
  }
});

test('all web source files stay outside backend generated auth and provider authority shortcuts', async () => {
  const sources = await readAllWebSources();
  const sourceBoundaryPatterns = [
    {
      name: 'Worker runtime import',
      pattern: /from\s+['"][^'"]*(?:apps\/worker|\.\.\/worker|worker\/src)[^'"]*['"]/,
    },
    {
      name: 'generated OpenAPI or projection import',
      pattern: /from\s+['"][^'"]*(?:workspace-api\/generated|docs\/generated|generated\/openapi|openapi\.json)[^'"]*['"]/,
    },
    {
      name: 'AI provider SDK import',
      pattern: /from\s+['"][^'"]*(?:ai-sdk|openai|anthropic|google|mistral|cohere)[^'"]*['"]/i,
    },
    {
      name: 'auth provider SDK import',
      pattern: /from\s+['"][^'"]*(?:clerk|auth0|firebase|supabase|next-auth|lucia|jsonwebtoken|jose)[^'"]*['"]/i,
    },
    {
      name: 'backend provider shortcut',
      pattern: /\b(?:providerAdapter|callProvider|createProvider|externalAction)\b/i,
    },
    {
      name: 'auth policy shortcut',
      pattern: /\b(?:verifyJwt|verifyToken|decodeJwt|createAuthClient|authProvider|authPolicy|workspaceMembership)\b/i,
    },
  ];

  for (const source of sources) {
    assertNoForbiddenPatterns(source, sourceBoundaryPatterns);
  }
});

test('only the DOM host adapter owns direct DOM APIs', async () => {
  const sources = await readExistingGuardedSources();
  const domHost = sources.find((source) => source.path === domOwnerPath);

  assert.ok(domHost);
  assert.match(domHost.text, /createNoteSurfaceDomHost/);
  assert.match(domHost.text, /innerHTML/);
  assert.match(domHost.text, /addEventListener/);

  for (const source of sources.filter((entry) => entry.path !== domOwnerPath)) {
    assertNoForbiddenPatterns(source, forbiddenDomPatterns);
  }
});

test('API transport uses only an injected fetch-like binding and never a browser global request', async () => {
  const sources = await readExistingGuardedSources();
  const transport = sources.find((source) => source.path === transportOwnerPath);

  assert.ok(transport);
  assert.match(transport.text, /fetchLike/);

  for (const source of sources) {
    assertNoForbiddenPatterns(source, [
      { name: 'global fetch or Request in transport path', pattern: /\b(?:globalThis\.fetch|window\.fetch|fetch\s*\(|XMLHttpRequest|new\s+Request\s*\()/ },
    ]);
  }
});

test('single note surface bootstrap sources do not create MVP-excluded surfaces', async () => {
  const sources = await readExistingGuardedSources();

  for (const source of sources) {
    assertNoForbiddenPatterns(source, forbiddenExcludedSurfacePatterns);
  }
});

async function discoverNoteSurfaceSourcePaths() {
  const entries = await readdir(webSourceRoot);
  return entries
    .filter((entry) => /^noteSurface.*\.ts$/.test(entry))
    .map((entry) => `apps/web/src/${entry}`)
    .sort();
}

async function readExistingGuardedSources() {
  const paths = await existingPaths(guardedSourcePaths);
  return Promise.all(paths.map(async (path) => ({
    path,
    text: await readFile(new URL(path, root), 'utf8'),
  })));
}

async function readAllWebSources() {
  const entries = await readdir(webSourceRoot);
  const paths = entries
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => `apps/web/src/${entry}`)
    .sort();

  return Promise.all(paths.map(async (path) => ({
    path,
    text: await readFile(new URL(path, root), 'utf8'),
  })));
}

async function existingPaths(paths) {
  const results = await Promise.all(paths.map(async (path) => ({
    path,
    exists: await pathExists(path),
  })));

  return results.filter((result) => result.exists).map((result) => result.path);
}

async function pathExists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

function assertNoForbiddenPatterns(source, forbiddenPatterns) {
  for (const { name, pattern } of forbiddenPatterns) {
    assert.doesNotMatch(source.text, pattern, `${source.path} must not contain ${name}`);
  }
}
