import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

const browserBuildConfigPath = 'apps/web/tsconfig.browser.json';
const browserBuildScriptPath = 'scripts/build-web.mjs';
const packageJsonPath = 'package.json';
const publicHtmlPath = 'apps/web/public/index.html';
const appEntryPath = 'apps/web/src/browserNoteSurfaceAppEntry.ts';
const browserMountPath = 'apps/web/src/browserNoteSurfaceMount.ts';

const applicationSourcePaths = [
  'apps/web/src/noteSurface.ts',
  'apps/web/src/noteSurfaceActionInputResolver.ts',
  'apps/web/src/noteSurfaceApiIntents.ts',
  'apps/web/src/noteSurfaceApiTransport.ts',
  'apps/web/src/noteSurfaceAppBootstrap.ts',
  'apps/web/src/noteSurfaceBrowserRuntime.ts',
  'apps/web/src/noteSurfaceDomHost.ts',
  'apps/web/src/noteSurfaceEventController.ts',
  'apps/web/src/noteSurfaceHtmlRenderer.ts',
  'apps/web/src/noteSurfaceHttpDigestProductApp.ts',
  'apps/web/src/noteSurfaceHttpDigestProductProvider.ts',
  'apps/web/src/noteSurfaceHttpProductApp.ts',
  'apps/web/src/noteSurfaceHttpProductProvider.ts',
  'apps/web/src/noteSurfaceProductApp.ts',
  'apps/web/src/noteSurfaceProductState.ts',
  'apps/web/src/noteSurfaceResolverOptionsFromDocument.ts',
];

const forbiddenApplicationBuildDetailPatterns = [
  {
    name: 'browser build config path',
    pattern: /\b(?:tsconfig\.browser|dist\/web|\/assets\/apps\/web|browserNoteSurfaceAppEntry\.js)\b/,
  },
  {
    name: 'deployment public template',
    pattern: /\b(?:apps\/web\/public|data-note-surface-root|data-api-base-url|data-workspace-id)\b/,
  },
  {
    name: 'module script or static import deployment start',
    pattern: /\b(?:type=["']module["']|startBrowserNoteSurfaceApp|document\.readyState|globalThis\.addEventListener)\b/,
  },
];

const forbiddenExcludedSurfacePatterns = [
  {
    name: 'persistent chat panel',
    pattern: /\b(?:persistent chat|chat panel|persistentChatPanel|ChatPanel)\b/i,
  },
  {
    name: 'AI mode switcher',
    pattern: /\b(?:AI Mode Switcher|aiModeSwitcher|AiModeSwitcher|mode-switcher)\b/,
  },
  {
    name: 'external integration surface',
    pattern: /\b(?:External Integrations|externalIntegrations|IntegrationsDashboard|external-integration)\b/i,
  },
];

test('web browser build script emits a browser ESM artifact without changing root noEmit typecheck', async () => {
  const packageJson = JSON.parse(await readText(packageJsonPath));
  const rootTsconfig = JSON.parse(await readText('tsconfig.json'));
  const browserTsconfig = JSON.parse(await readText(browserBuildConfigPath));

  const buildScript = await readText(browserBuildScriptPath);

  assert.equal(packageJson.scripts['build:web'], 'node scripts/build-web.mjs');
  assert.equal(rootTsconfig.compilerOptions.noEmit, true);
  assert.equal(browserTsconfig.extends, '../../tsconfig.json');
  assert.equal(browserTsconfig.compilerOptions.noEmit, false);
  assert.equal(browserTsconfig.compilerOptions.outDir, '../../dist/web/assets');
  assert.equal(browserTsconfig.compilerOptions.rootDir, '../..');
  assert.equal(browserTsconfig.compilerOptions.module, 'ES2022');
  assert.equal(browserTsconfig.compilerOptions.moduleResolution, 'Bundler');
  assert.equal(browserTsconfig.compilerOptions.rewriteRelativeImportExtensions, true);
  assert.deepEqual(browserTsconfig.include, ['src/**/*.ts']);
  assert.match(buildScript, /apps\/web\/public/);
  assert.match(buildScript, /dist\/web/);
  assert.match(buildScript, /cpSync\(publicDir, outputDir, \{ recursive: true \}\)/);
  assert.match(buildScript, /'tsc', \['-p', 'apps\/web\/tsconfig\.browser\.json'\]/);
});

test('public HTML is a deployment page that explicitly starts the compiled browser app entry', async () => {
  const html = await readText(publicHtmlPath);

  assert.match(html, /<main data-note-surface-root><\/main>/);
  assert.match(html, /from ['"]\/assets\/apps\/web\/src\/browserNoteSurfaceAppEntry\.js['"]/);
  assert.match(html, /\bstartBrowserNoteSurfaceApp\s*\(/);
  assert.match(html, /document\.readyState/);
  assert.match(html, /globalThis\.addEventListener\.bind\(globalThis\)/);
  assert.match(html, /Deployment must provide data-api-base-url, data-workspace-id, and data-note-id\./);
  assert.doesNotMatch(html, /browserNoteSurfaceAppEntry\.ts/);
  assert.doesNotMatch(html, /\b(?:data-api-base-url|data-workspace-id|data-note-id)=["'][^"']+["']/);
  assertNoForbiddenPatterns(html, forbiddenExcludedSurfacePatterns);
});

test('browser app entry source remains import-time inert and does not auto-start from TypeScript source', async () => {
  const source = await readText(appEntryPath);

  assert.match(source, /export function startBrowserNoteSurfaceApp/);
  assert.doesNotMatch(source, /\b(?:await\s+)?startBrowserNoteSurfaceApp\s*\(\s*[{[]/);
  assert.doesNotMatch(source, /\bcreateBrowserNoteSurfaceAppEntry\s*\([^)]*\)\.start\s*\(\s*[{[]/);
  assert.doesNotMatch(source, /\bdocument\.readyState\b/);
  assert.doesNotMatch(source, /\bglobalThis\.addEventListener\b/);
});

test('browser deployment global and dataset metadata ownership stays in the mount adapter', async () => {
  const mountSource = await readText(browserMountPath);
  const applicationSources = await Promise.all(applicationSourcePaths.map(readSource));

  assert.match(mountSource, /readGlobalDocumentLike/);
  assert.match(mountSource, /readGlobalFetchLike/);
  assert.match(mountSource, /resolveDatasetOptions/);
  assert.match(mountSource, /dataset\.apiBaseUrl/);
  assert.match(mountSource, /dataset\.workspaceId/);
  assert.match(mountSource, /dataset\.noteId/);

  for (const source of applicationSources) {
    assertNoForbiddenPatterns(source.text, forbiddenApplicationBuildDetailPatterns, source.path);
  }
});

test('browser static build files do not introduce MVP-excluded surfaces', async () => {
  const sources = await Promise.all([
    readSource(browserBuildConfigPath),
    readSource(publicHtmlPath),
    readSource(appEntryPath),
    readSource(browserMountPath),
  ]);

  for (const source of sources) {
    assertNoForbiddenPatterns(source.text, forbiddenExcludedSurfacePatterns, source.path);
  }
});

async function readSource(path) {
  return {
    path,
    text: await readText(path),
  };
}

async function readText(path) {
  return readFile(new URL(path, root), 'utf8');
}

function assertNoForbiddenPatterns(text, forbiddenPatterns, path = 'source') {
  for (const forbidden of forbiddenPatterns) {
    assert.doesNotMatch(text, forbidden.pattern, `${path} contains ${forbidden.name}`);
  }
}
