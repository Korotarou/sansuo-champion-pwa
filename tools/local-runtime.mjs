import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import http from 'node:http';
import assert from 'node:assert/strict';
import { validateRootAppCache } from './root-app-cache.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.local-runtime');
const marker = '.generated-by-local-runtime';
const runtime = ['app.js', 'problem_engine.js', 'problems.js'];
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');

function decode(name) {
  const prefix = `${name}.gz.b64.`;
  const parts = fs.readdirSync(path.join(root, '.gzparts')).filter(n => n.startsWith(prefix)).sort();
  assert(parts.length, `Missing payload: ${name}`);
  parts.forEach((part, i) => assert.equal(part, prefix + String(i).padStart(2, '0'), `Non-contiguous parts: ${name}`));
  const base64 = parts.map(n => read(path.join(root, '.gzparts'), n)).join('').replace(/\s/g, '');
  assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64), `Invalid base64: ${name}`);
  const bytes = gunzipSync(Buffer.from(base64, 'base64'), { maxOutputLength: 16 * 1024 * 1024 });
  assert(bytes.length, `Empty payload: ${name}`);
  return bytes;
}

function localFile(ref) {
  assert(!/^[a-z]+:|^\/\//i.test(ref), `Non-local runtime reference: ${ref}`);
  const name = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\.\//, '') || 'index.html';
  assert(!path.isAbsolute(name) && !name.split(/[\\/]/).includes('..'), `Invalid runtime path: ${ref}`);
  return name;
}

function references(dir) {
  const html = read(dir, 'index.html');
  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
  const context = vm.createContext({ self: { addEventListener() {} } });
  vm.runInContext(read(dir, 'sw.js'), context, { timeout: 1000 });
  refs.push(...vm.runInContext('ASSETS', context, { timeout: 1000 }));
  const manifest = JSON.parse(read(dir, 'manifest.webmanifest'));
  refs.push(manifest.start_url, ...manifest.icons.map(icon => icon.src));
  // CSS may introduce additional fonts or images.
  for (const css of refs.filter(r => r.endsWith('.css'))) {
    for (const match of read(dir, localFile(css)).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      refs.push(path.posix.join(path.posix.dirname(css), match[1]));
    }
  }
  return [...new Set(['index.html', 'sw.js', ...refs.map(localFile)])];
}

function validate(dir = output) {
  assert.equal(read(dir, 'sw.js'), read(root, 'sw.js'), 'Runtime service worker differs from root');
  validateRootAppCache(read(dir, 'sw.js'), fs.readFileSync(path.join(dir, 'app.js')));
  console.log('Root app payload/cache binding: PASS');
  for (const name of runtime) {
    assert(fs.readFileSync(path.join(dir, name)).equals(decode(name)), `Payload byte mismatch: ${name}`);
    const check = spawnSync(process.execPath, ['--check', path.join(dir, name)], { encoding: 'utf8', timeout: 10000 });
    assert.equal(check.status, 0, `${name} syntax: ${check.error || check.stderr}`);
    console.log(`${name} syntax: PASS`);
  }
  const files = references(dir);
  for (const name of files) assert(fs.statSync(path.join(dir, name)).isFile(), `Missing runtime file: ${name}`);
  const context = vm.createContext({ window: {} });
  for (const name of ['problems.js', 'problem_engine.js', 'all_problems.js', 'curriculum.js']) {
    vm.runInContext(read(dir, name), context, { filename: name, timeout: 5000 });
  }
  const w = context.window;
  assert.equal(w.PROBLEMS.length, 438);
  assert.equal(new Set(w.PROBLEMS.map(q => q.id)).size, 438);
  assert.equal(w.CORE_PROBLEMS.length, 18);
  assert.equal(w.GENERATED_PROBLEMS.length, 420);
  const families = new Set(w.GENERATED_PROBLEMS.map(q => q.family));
  assert(!families.has(undefined), 'Missing generated family');
  assert.equal(families.size, 30);
  assert.equal(w.CURRICULUM_WEEKS.length, 52);
  for (const q of w.PROBLEMS) {
    for (const field of ['id', 'track', 'level', 'title', 'tags', 'prompt', 'answer', 'answerType', 'solution']) {
      assert(q[field] !== undefined && q[field] !== null, `Missing ${field}: ${q.id}`);
    }
  }
  console.log(`PASS: 438 unique questions (18 core + 420 generated), 30 families, 52 weeks; ${files.length} root runtime assets present; payload bytes unchanged.`);
  return files;
}

function build() {
  // Decode before touching any previous generated output.
  const decoded = runtime.map(name => [name, decode(name)]);
  validateRootAppCache(read(root, 'sw.js'), decoded.find(([name]) => name === 'app.js')[1]);
  if (fs.existsSync(output)) {
    assert(!fs.lstatSync(output).isSymbolicLink(), 'Refusing linked output directory');
    assert.equal(fs.realpathSync(output), path.join(fs.realpathSync(root), '.local-runtime'));
    const markerPath = path.join(output, marker);
    assert(fs.existsSync(markerPath) && !fs.lstatSync(markerPath).isSymbolicLink() && read(output, marker) === 'disposable local runtime\n', 'Refusing unmarked output directory');
    fs.rmSync(output, { recursive: true });
  }
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, marker), 'disposable local runtime\n');
  // Copy public root assets only; never copy Git, docs, or transfer payloads.
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:html|js|css|webmanifest|json|txt)$/.test(entry.name)) {
      fs.copyFileSync(path.join(root, entry.name), path.join(output, entry.name));
    }
  }
  for (const dir of ['assets', 'japanese', 'science', 'social']) fs.cpSync(path.join(root, dir), path.join(output, dir), { recursive: true });
  for (const [name, bytes] of decoded) fs.writeFileSync(path.join(output, name), bytes);
  validate();
  console.log('Generated output: .local-runtime/');
}

function serve() {
  validate();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      assert(!name.includes('\\') && !name.includes('\0'));
      let target = path.resolve(output, '.' + name);
      assert(target.startsWith(output + path.sep) || target === output);
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      assert(fs.realpathSync(target).startsWith(fs.realpathSync(output) + path.sep));
      const bytes = fs.readFileSync(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('Local PWA: http://127.0.0.1:4173/ (Ctrl+C to stop)'));
}

try {
  const command = process.argv[2];
  assert(process.argv.length === 3 && ['build', 'validate', 'serve'].includes(command), 'Usage: node tools/local-runtime.mjs build|validate|serve');
  if (command === 'build') build();
  if (command === 'validate') validate();
  if (command === 'serve') serve();
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
