// Use the build API so native workers close naturally on Windows.
// vinext CLI's immediate process.exit() triggers a libuv close assertion here.
import { access, readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'production';
const base = process.env.PAGES_BASE_PATH || '';
if (
  !/^(\/[A-Za-z0-9_.-]+)*$/.test(base) ||
  base.split('/').some((x) => x === '.' || x === '..')
)
  throw new Error('Invalid PAGES_BASE_PATH');
const { createBuilder } = await import('vite');
const { runPrerender } = await import('vinext/internal/build/run-prerender');
const builder = await createBuilder({ mode: 'production', logLevel: 'warn' });
await builder.buildApp();
const result = await runPrerender({ root: process.cwd() });
if (result.routes.some((route) => route.status === 'error'))
  throw new Error('Static prerender failed');
const publicDir = 'dist/client' + base;
for (const file of [
  'index.html',
  'python-worker.mjs',
  'tracer.py',
  '.nojekyll',
])
  await access(publicDir + '/' + file);
const html = await readFile(publicDir + '/index.html', 'utf8');
if (!html.includes('Stepwise'))
  throw new Error('Expected Stepwise page in static output');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = new URL(match[1], 'https://stepwise.test' + base + '/');
  if (
    url.origin === 'https://stepwise.test' &&
    /\.(css|js|svg)$/.test(url.pathname)
  )
    await access('dist/client' + decodeURIComponent(url.pathname));
}
console.log('Static build and asset paths verified: ' + publicDir);
