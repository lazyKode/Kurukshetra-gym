// Builds the static, offline-capable site for GitHub Pages into ./out
//   npm run build:pages
// Set PAGES_BASE_PATH if the site is not served from /Kurukshetra-gym.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const basePath = process.env.PAGES_BASE_PATH ?? '/Kurukshetra-gym';
const outDir = path.resolve('out');

const build = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PAGES: '1', PAGES_BASE_PATH: basePath },
});
if (build.status !== 0) process.exit(build.status ?? 1);

// List every exported file so the service worker can store the whole app for offline use.
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(path.relative(outDir, full).split(path.sep).join('/'));
  }
};
walk(outDir);
const precache = files.filter((file) => file !== 'sw.js' && file !== '.nojekyll').sort();

const hash = createHash('sha256');
for (const file of precache) hash.update(file).update(readFileSync(path.join(outDir, file)));
const version = hash.digest('hex').slice(0, 12);

const template = readFileSync(path.resolve('scripts/sw-template.js'), 'utf8');
writeFileSync(
  path.join(outDir, 'sw.js'),
  template
    .replace('__BASE__', JSON.stringify(basePath))
    .replace('__VERSION__', JSON.stringify(version))
    .replace('__FILES__', JSON.stringify(precache))
);
console.log(`Offline service worker written: ${precache.length} files, version ${version}`);
