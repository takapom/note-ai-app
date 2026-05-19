import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const outputDir = new URL('../dist/web/', import.meta.url);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(publicDir, outputDir, { recursive: true });

const result = spawnSync('tsc', ['-p', 'apps/web/tsconfig.browser.json'], {
  stdio: 'inherit',
});

if (result.error !== undefined) {
  throw result.error;
}

process.exit(result.status ?? 1);
