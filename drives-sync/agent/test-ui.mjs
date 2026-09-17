/* Drives Sync web app - end-to-end test in headless Chromium with the fake Google/GitHub APIs
   from test-fakes.mjs routed through Playwright. Needs the `playwright` package (a global
   install works: PLAYWRIGHT_MODULE=$(npm root -g)/playwright).
   Run from the Lobby repository root:  node drives-sync/agent/test-ui.mjs */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import * as core from '../core.js';
import { makeFakeWorld } from './test-fakes.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch { /* no npm */ }
  for (const c of candidates.filter(Boolean)) { try { return require(c); } catch { /* next */ } }
  throw new Error('playwright module not found; set PLAYWRIGHT_MODULE');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// TEST_TARGET=single tests the one-file edition built by build-single.mjs instead of index.html.
const SINGLE = process.env.TEST_TARGET === 'single';
const base = `http://127.0.0.1:${server.address().port}/drives-sync/${SINGLE ? 'drives-sync.html' : ''}`;

const world = makeFakeWorld();
world.addFile('note.txt', world.rootId, 'hello from drive');
const research = world.addFolder('Research', world.rootId);
world.addGoogleDoc('Memo', research, 'memo body');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const notFound = [];
page.on('response', (r) => { if (r.status() === 404 && r.url().startsWith('http://127.0.0.1')) notFound.push(r.url()); }); // API 404s (no manifest yet, missing folder) are expected
await page.route('https://accounts.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* gis stub */' }));
await page.route(/^https:\/\/(www\.googleapis\.com|api\.github\.com|oauth2\.googleapis\.com)\//, async (route) => {
  const req = route.request();
  const h = req.headers();
  const headers = {};
  if (h.authorization) headers.Authorization = h.authorization;
  if (h.accept) headers.Accept = h.accept;
  if (h['content-type']) headers['Content-Type'] = h['content-type'];
  if (h['content-range']) headers['Content-Range'] = h['content-range'];
  if (h['x-upload-content-type']) headers['X-Upload-Content-Type'] = h['x-upload-content-type'];
  const res = await world.fetch(req.url(), { method: req.method(), headers, body: req.postDataBuffer() || undefined });
  const out = {};
  res.headers.forEach((v, k) => { out[k] = v; });
  await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
});

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name); console.log(e.stack || e); process.exitCode = 1; }
}
const api = (expr) => page.evaluate(expr);

console.log(`Drives Sync UI tests (${SINGLE ? 'one-file edition' : 'index.html'})`);

await test('page loads with all feature bars and the agent API', async () => {
  await page.goto(base);
  await page.waitForFunction(() => window.DrivesSync && document.getElementById('agent-state').textContent.includes('Drives Sync'));
  for (const id of ['bar-preflight', 'bar-stock', 'bar-flow', 'bar-automation', 'bar-agent', 'bar-settings']) assert.ok(await page.$('#' + id), id);
  assert.equal(await page.title(), 'Drives Sync');
  assert.equal(await api('DrivesSync.version'), core.VERSION);
  assert.equal(await api('document.body.dataset.state'), 'idle');
  assert.equal(await api('!!(window.DRIVES_SYNC_BUILD && window.DRIVES_SYNC_BUILD.single)'), SINGLE, 'build flag matches the edition under test');
  if (SINGLE) assert.equal(await api("document.querySelector('link[rel=manifest]') && document.querySelector('link[rel=manifest]').href.startsWith('blob:')"), true, 'one-file edition offers its manifest from memory');
});

await test('brake: without logins, preflight fails and nothing runs', async () => {
  const pf = await api('DrivesSync.preflight()');
  assert.equal(pf.ok, false);
  assert.ok(pf.reasons.some((r) => r.includes('Google')) && pf.reasons.some((r) => r.includes('GitHub')));
  const res = await api('DrivesSync.runStock()');
  assert.equal(res.braked, true);
  assert.equal(await api('document.body.dataset.state'), 'braked');
  assert.ok((await page.textContent('#stock-summary')).includes('브레이크'));
  const flow = await api('DrivesSync.runFlow()');
  assert.equal(flow.braked, true);
  assert.ok(flow.reasons.some((r) => r.includes('폴더')));
  assert.equal(world.calls.filter((c) => /^(POST|PATCH)/.test(c)).length, 0, 'nothing written');
});

await test('settings persist and feed the path lines', async () => {
  await page.fill('#github-target', 'fin-lab/FinResearchRaw');
  await page.fill('#device-name', 'TestLaptop');
  await page.dispatchEvent('#device-name', 'change');
  await page.reload();
  await page.waitForFunction(() => window.DrivesSync);
  assert.equal(await page.inputValue('#device-name'), 'TestLaptop');
  assert.ok((await page.textContent('#flow-to')).includes('DrivesSync/TestLaptop'));
  const cfg = await api("DrivesSync.config.set({ github: { targetPath: '/fin-lab/FinResearchRaw/' } })");
  assert.equal(cfg.github.targetPath, 'fin-lab/FinResearchRaw');
});

await test('with the right accounts: preflight passes, chips show the accounts', async () => {
  await page.evaluate((scope) => {
    localStorage.setItem('ds.google.token', JSON.stringify({ access_token: 'GTOKEN', expires_at: Date.now() + 3600e3, scope }));
    DrivesSync.tokens.setGitHub('GHTOKEN');
  }, core.GOOGLE_SCOPE_DRIVE);
  await page.reload();
  await page.waitForFunction(() => window.DrivesSync && document.getElementById('status-google').dataset.state === 'ok', null, { timeout: 15000 });
  assert.ok((await page.textContent('#status-google')).includes('honggusangjoon@gmail.com'));
  assert.ok((await page.textContent('#status-github')).includes('hongguqaz'));
  const pf = await api('DrivesSync.preflight()');
  assert.equal(pf.ok, true, JSON.stringify(pf.reasons));
  assert.equal(await page.getAttribute('#chip-preflight', 'data-state'), 'ok');
});

await test('brake: a wrong Google account is reported and refused', async () => {
  world.email = 'other.person@gmail.com';
  const pf = await api('DrivesSync.preflight()');
  assert.equal(pf.ok, false);
  assert.ok(pf.reasons.some((r) => r.includes('other.person@gmail.com') && r.includes('honggusangjoon@gmail.com')), JSON.stringify(pf.reasons));
  assert.ok(!(await page.isHidden('#banner')), 'banner shows the reason');
  world.email = 'honggusangjoon@gmail.com';
});

await test('Stock Matching from the UI button copies Drive files into the repo folder', async () => {
  await page.click('#btn-stock-run');
  await page.waitForFunction(() => document.body.dataset.state === 'idle' && !document.getElementById('stock-summary').hidden, null, { timeout: 20000 });
  const text = await page.textContent('#stock-summary');
  assert.ok(text.includes('2개 동기화'), text);
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/note.txt').toString(), 'hello from drive');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/Research/Memo.docx').toString(), 'EXPORTED:memo body');
  const again = await api('DrivesSync.runStock()');
  assert.equal(again.synced, 0);
  assert.equal(again.unchanged, 2);
});

await test('Flow Matching: a one-shot folder uploads new files to Drive and GitHub', async () => {
  const f = await api("DrivesSync.folders.add({ label: 'Scans', mode: 'oneshot' })");
  assert.equal(f.mode, 'oneshot');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-scans-'));
  await fs.writeFile(path.join(dir, 'scan-1.txt'), 'first scan');
  await fs.mkdir(path.join(dir, 'sub'));
  await fs.writeFile(path.join(dir, 'sub', 'scan-2.txt'), 'second scan');
  const button = page.locator(`.folder[data-id="${f.id}"] button`, { hasText: '폴더 선택 후 업로드' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
  await chooser.setFiles(dir);
  await page.waitForFunction(() => document.body.dataset.state === 'idle' && !document.getElementById('flow-summary').hidden, null, { timeout: 20000 });
  const text = await page.textContent('#flow-summary');
  const errs = await api("DrivesSync.logs.get(100).filter((l) => l.level === 'error').map((l) => l.msg)");
  assert.ok(text.includes('2개 업로드'), text + '\n' + errs.join('\n'));
  const names = [...world.drive.files.values()].map((x) => x.name);
  assert.ok(names.includes('scan-1.txt') && names.includes('TestLaptop') && names.includes('Scans'), names.join(','));
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/DrivesSync/TestLaptop/Scans/scan-1.txt').toString(), 'first scan');
  const folders = await api('DrivesSync.folders.list()');
  assert.equal(folders[0].lastResult.uploaded, 2);
  const stock = await api('DrivesSync.runStock()');
  assert.equal(stock.synced, 0, 'flow uploads are already recorded for stock');
});

await test('brake: automation refuses one-shot folders and reports why; disable works', async () => {
  const res = await api('DrivesSync.automation.enable({ intervalMinutes: 5 })');
  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((r) => r.includes('자동 실행할 수 없습니다')), JSON.stringify(res.reasons));
  assert.equal((await api('DrivesSync.automation.status()')).enabled, false);
  assert.equal(await page.isChecked('#auto-toggle'), false);
  const prereqs = await page.textContent('#auto-prereqs');
  assert.ok(prereqs.includes('Scans'));
  await api("DrivesSync.folders.remove(DrivesSync.folders.list()[0].id)");
  const res2 = await api('DrivesSync.automation.enable({ intervalMinutes: 5 })');
  assert.equal(res2.ok, false);
  assert.ok(res2.reasons.some((r) => r.includes('기기 폴더')));
  assert.equal((await api('DrivesSync.automation.disable()')).ok, true);
});

await test('brake: a missing target folder stops the run and offers to create it', async () => {
  await api("DrivesSync.config.set({ github: { targetPath: 'fin-lab/Elsewhere' } })");
  const res = await api('DrivesSync.runStock()');
  assert.equal(res.braked, true);
  assert.ok(res.reasons.some((r) => r.includes('fin-lab/Elsewhere')));
  await page.waitForFunction(() => !document.getElementById('btn-create-target').hidden);
  await page.click('#btn-create-target');
  await page.waitForFunction(() => document.body.dataset.state === 'idle' && document.getElementById('btn-create-target').hidden, null, { timeout: 20000 });
  assert.ok(world.fileAt('fin-lab/Elsewhere/README.md'));
  await api("DrivesSync.config.set({ github: { targetPath: 'fin-lab/FinResearchRaw' } })");
});

await test('state JSON hides secrets and the logs are readable', async () => {
  const st = await api('DrivesSync.getState()');
  assert.equal(JSON.stringify(st).includes('GHTOKEN'), false);
  assert.equal(JSON.stringify(st).includes('GTOKEN'), false);
  assert.ok(st.lastRuns.stock && st.folders.length === 0 && st.automation.enabled === false);
  const logs = await api('DrivesSync.logs.get(50)');
  assert.ok(logs.length > 5 && logs.every((l) => l.t && l.level && l.msg));
});

await test('renders at phone width without horizontal overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForFunction(() => window.DrivesSync);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(os.tmpdir(), 'drives-sync-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.reload();
  await page.waitForFunction(() => window.DrivesSync);
  await page.screenshot({ path: path.join(os.tmpdir(), 'drives-sync-desktop.png'), fullPage: true });
  console.log(`  screenshots in ${os.tmpdir()}/drives-sync-{desktop,phone}.png`);
});

await test('no page errors, no missing files', () => {
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  assert.deepEqual(real, []);
  assert.deepEqual(notFound.filter((u) => !/favicon\.ico$/.test(u)), []);
});

await browser.close();
server.close();
console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
