import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Usage: node tools/pack-app.mjs path/to/intended/app.js
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.argv.length, 3, 'Supply the intended app.js source path');
const source = path.resolve(process.argv[2]);
const bytes = fs.readFileSync(source);
const check = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'Source syntax check failed');
const compressed = gzipSync(bytes, { level: 9 });
assert(gunzipSync(compressed).equals(bytes));
const encoded = compressed.toString('base64');
const dir = path.join(root, '.gzparts');
const prefix = 'app.js.gz.b64.';
const old = fs.readdirSync(dir).filter(n => /^app\.js\.gz\.b64\.\d{2}$/.test(n));
const parts = encoded.match(/.{1,7000}/g);
assert(parts.length <= 100);
const names = parts.map((_, i) => prefix + String(i).padStart(2, '0'));
parts.forEach((part, i) => fs.writeFileSync(path.join(dir, names[i]), part));
for (const name of old) if (!names.includes(name)) fs.unlinkSync(path.join(dir, name));
console.log(`Packed app.js: ${bytes.length} bytes, ${parts.length} parts (7000 Base64 characters each except last)`);
