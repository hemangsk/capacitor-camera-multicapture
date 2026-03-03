import { watch } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

const DEBOUNCE_MS = 600;

let timer = null;
let building = false;
let pendingBuild = false;

function build() {
  if (building) {
    pendingBuild = true;
    return;
  }
  building = true;
  const start = Date.now();
  console.log(`\n[dev-watch] Building...`);
  try {
    execSync('npx tsc && npx rollup -c rollup.config.mjs', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${resolve(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
    });
    console.log(`[dev-watch] ✓ Build succeeded in ${Date.now() - start}ms`);
  } catch {
    console.log(`[dev-watch] ✗ Build failed in ${Date.now() - start}ms`);
  }
  building = false;
  if (pendingBuild) {
    pendingBuild = false;
    scheduleBuild();
  }
}

function scheduleBuild() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(build, DEBOUNCE_MS);
}

console.log('[dev-watch] Initial build...');
build();

console.log(`[dev-watch] Watching src/ for changes (debounce: ${DEBOUNCE_MS}ms)...`);
watch(SRC, { recursive: true }, (_event, filename) => {
  if (!filename || !filename.endsWith('.ts')) return;
  console.log(`[dev-watch] Changed: ${filename}`);
  scheduleBuild();
});
