import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Append a new version/hash pair when app.js changes; preserve existing pairs.
// Hash the decoded payload bytes, not the gzip/base64 transport representation.
const releases = [
  ['sansuo-champion-v18-adaptive-quality', '8df6d828da7de34d4ffbd84a60603d265e1518f434e14f69fdc68435e9fc2460'],
];

export function validateRootAppCache(worker, payload) {
  const cache = worker.match(/^const CACHE=['"]([^'"]+)['"];$/m)?.[1];
  const [latestCache, expectedHash] = releases.at(-1);
  assert.equal(cache, latestCache, 'Root service-worker cache must use the latest registered version');
  assert.equal(createHash('sha256').update(payload).digest('hex'), expectedHash,
    'Root app payload changed: bump sw.js CACHE and append a new version/hash pair in tools/root-app-cache.mjs');
}
