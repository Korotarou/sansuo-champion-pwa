import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateRootAppCache } from './root-app-cache.mjs';

const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const payload = fs.readFileSync(new URL('../.local-runtime/app.js', import.meta.url));
validateRootAppCache(worker, payload);
assert.throws(() => validateRootAppCache(worker, Buffer.concat([payload, Buffer.from('\n')])), /Root app payload changed/);
assert.throws(() => validateRootAppCache(worker.replace('v19-', 'v18-'), payload), /latest registered version/);
assert.throws(() => validateRootAppCache(worker.replace('v19-', 'v20-'), payload), /latest registered version/);
console.log('PASS 4/4: current binding, changed payload, stale cache, unregistered cache');
