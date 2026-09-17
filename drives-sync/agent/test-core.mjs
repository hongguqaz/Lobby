/* Drives Sync core - tests against fake Google Drive and GitHub APIs.
   Run: node drives-sync/agent/test-core.mjs   (from the Lobby repository root, Node 18+) */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as core from '../core.js';
import { makeFakeWorld, makeCtx } from './test-fakes.mjs';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name); console.log(e.stack || e); process.exitCode = 1; }
}

console.log('Drives Sync core tests');

await test('helpers: sanitizeSegment / joinPath / isSyncNoise', () => {
  assert.equal(core.sanitizeSegment(' a/b:c*?.pdf. '), 'a_b_c__.pdf');
  assert.equal(core.sanitizeSegment('..'), '_');
  assert.equal(core.sanitizeSegment('.gitignore'), '_.gitignore');
  assert.equal(core.joinPath('/fin-lab/', 'FinResearchRaw', '', 'a/b'), 'fin-lab/FinResearchRaw/a/b');
  assert.ok(core.isSyncNoise('.DS_Store') && core.isSyncNoise('~$report.docx') && core.isSyncNoise('x.crdownload'));
  assert.ok(!core.isSyncNoise('report.pdf'));
  assert.equal(core.withDefaults({ github: { branch: 'x' } }).github.owner, 'hongguqaz');
  assert.equal(core.withDefaults({ github: { branch: 'x' } }).github.branch, 'x');
});

await test('preflight passes with the right accounts and target folder', async () => {
  const world = makeFakeWorld();
  const { ctx } = makeCtx(world);
  const pf = await core.preflight(ctx, { scope: 'stock' });
  assert.equal(pf.ok, true, JSON.stringify(pf.reasons));
  assert.ok(pf.checks.length >= 9);
});

await test('brake: no Google login', async () => {
  const world = makeFakeWorld();
  const { ctx } = makeCtx(world, { googleToken: null });
  const pf = await core.preflight(ctx);
  assert.equal(pf.ok, false);
  assert.equal(pf.needLogin, true);
  assert.ok(pf.reasons.some((r) => r.includes('로그인되어 있지 않습니다')));
  const res = await core.runStockMatching(ctx);
  assert.equal(res.braked, true);
  assert.equal(world.calls.filter((c) => /^(POST|PATCH) .*(git\/(trees|commits|refs)|upload)/.test(c)).length, 0, 'nothing written when braked (the write probe blob is unreferenced)');
});

await test('brake: a different Google account is logged in', async () => {
  const world = makeFakeWorld({ email: 'someone.else@gmail.com' });
  const { ctx } = makeCtx(world);
  const pf = await core.preflight(ctx);
  assert.equal(pf.ok, false);
  assert.equal(pf.mismatch, true);
  assert.ok(pf.reasons.some((r) => r.includes('someone.else@gmail.com') && r.includes('honggusangjoon@gmail.com')));
});

await test('brake: wrong GitHub account, no write permission, missing target folder', async () => {
  let world = makeFakeWorld({ login: 'stranger' });
  let pf = await core.preflight(makeCtx(world).ctx);
  assert.ok(pf.reasons.some((r) => r.includes('stranger')));
  world = makeFakeWorld({ canWrite: false });
  pf = await core.preflight(makeCtx(world).ctx);
  assert.ok(pf.reasons.some((r) => r.includes('쓰기 권한')));
  world = makeFakeWorld({ targetExists: false });
  pf = await core.preflight(makeCtx(world).ctx);
  assert.equal(pf.missingTarget, true);
  assert.ok(pf.reasons.some((r) => r.includes('fin-lab/FinResearchRaw')));
});

await test('brake: read-only Google scope cannot run Flow', async () => {
  const world = makeFakeWorld({ scope: core.GOOGLE_SCOPE_DRIVE_READONLY });
  const { ctx } = makeCtx(world);
  assert.equal((await core.preflight(ctx, { scope: 'stock' })).ok, true);
  const res = await core.runFlowMatching(ctx, { folders: [{ id: 'x', label: 'X', source: core.listFolderSource('X', []) }] });
  assert.equal(res.braked, true);
  assert.ok(res.reasons.some((r) => r.includes('쓰기 권한')));
});

await test('stock: syncs new files, exports Google Docs, batches commits, is idempotent', async () => {
  const world = makeFakeWorld();
  const docs = world.addFolder('Research', world.rootId);
  world.addFile('note.txt', world.rootId, 'hello');
  world.addFile('report.pdf', docs, 'pdfdata');
  world.addFile('bad/name:1.csv', docs, 'a,b');
  world.addGoogleDoc('Memo', docs, 'memo body');
  world.addFile('big.bin', docs, 'x'.repeat(50));
  const { ctx, logs } = makeCtx(world, { config: { limits: { maxFileBytes: 40 } } });
  const res = await core.runStockMatching(ctx);
  assert.equal(res.ok, true);
  assert.equal(res.synced, 4, JSON.stringify(res));
  assert.equal(res.skipped.length, 1);
  assert.ok(res.skipped[0].reason.includes('크기 초과'));
  assert.equal(res.commits.length, 2, 'batchFiles=2 -> two commits');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/note.txt').toString(), 'hello');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/Research/report.pdf').toString(), 'pdfdata');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/Research/bad_name_1.csv').toString(), 'a,b');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/Research/Memo.docx').toString(), 'EXPORTED:memo body');
  const manifest = JSON.parse(world.fileAt('fin-lab/FinResearchRaw/.drives-sync/manifest.json').toString());
  assert.equal(Object.keys(manifest.files).length, 4);
  assert.ok(manifest.stock.lastRun);
  assert.equal(manifest.stock.runs.length, 1);
  // second run: nothing to do, no new commit
  const head = world.git.head;
  const again = await core.runStockMatching(ctx);
  assert.equal(again.synced, 0);
  assert.equal(again.unchanged, 4);
  assert.equal(world.git.head, head, 'no commit when nothing changed');
  // change a file in Drive -> only that file re-syncs; deletions never propagate
  const noteId = [...world.drive.files.values()].find((f) => f.name === 'note.txt').id;
  world.drive.files.get(noteId).content = Buffer.from('hello v2');
  world.drive.files.get(noteId).md5Checksum = createHash('md5').update('hello v2').digest('hex');
  const reportId = [...world.drive.files.values()].find((f) => f.name === 'report.pdf').id;
  world.drive.files.delete(reportId);
  const third = await core.runStockMatching(ctx);
  assert.equal(third.synced, 1);
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/note.txt').toString(), 'hello v2');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/Research/report.pdf').toString(), 'pdfdata', 'deleted in Drive stays in GitHub');
  assert.ok(logs.some((l) => l.level === 'warn' && l.msg.includes('big.bin')));
});

await test('stock: dry run plans without writing; duplicate names get a suffix', async () => {
  const world = makeFakeWorld();
  world.addFile('same.txt', world.rootId, 'one');
  world.addFile('same.txt', world.rootId, 'two');
  const { ctx } = makeCtx(world);
  const dry = await core.runStockMatching(ctx, { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.planned, 2);
  assert.ok(dry.plan.some((p) => /same \[.+\]\.txt$/.test(p.path)), JSON.stringify(dry.plan));
  assert.equal(world.calls.filter((c) => c.includes('git/commits') && c.startsWith('POST')).length, 0);
});

await test('stock: recovers when the branch moves between read and update', async () => {
  const world = makeFakeWorld();
  world.addFile('a.txt', world.rootId, 'A');
  world.conflictOnce = true;
  const { ctx, logs } = makeCtx(world);
  const res = await core.runStockMatching(ctx);
  assert.equal(res.ok, true);
  assert.equal(res.synced, 1);
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/a.txt').toString(), 'A');
  assert.ok(logs.some((l) => l.msg.includes('다시 만듭니다')));
});

await test('flow: uploads new device files to Drive and GitHub in parallel, additive, chunked upload', async () => {
  const world = makeFakeWorld();
  const mk = (relPath, content, mtime) => ({ relPath, size: content.length, lastModified: mtime, read: async () => new Blob([content]) });
  const photos = [mk('IMG_1.jpg', 'jpegdata-1', 1000), mk('sub/IMG_2.jpg', 'jpegdata-2-longer-than-chunk', 2000), mk('.DS_Store', 'x', 1)];
  const notes = [mk('memo.md', '# memo', 3000)];
  const { ctx } = makeCtx(world);
  const folders = [
    { id: 'p', label: 'Photos', source: core.listFolderSource('Photos', photos) },
    { id: 'n', label: 'Notes', source: core.listFolderSource('Notes', notes) },
  ];
  const res = await core.runFlowMatching(ctx, { folders });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.uploaded, 3);
  const driveNames = [...world.drive.files.values()].map((f) => f.name);
  assert.ok(driveNames.includes('IMG_1.jpg') && driveNames.includes('memo.md') && driveNames.includes('DrivesSync') && driveNames.includes('Laptop') && driveNames.includes('Photos'));
  const img2 = [...world.drive.files.values()].find((f) => f.name === 'IMG_2.jpg');
  assert.equal(img2.content.toString(), 'jpegdata-2-longer-than-chunk', 'chunks reassembled');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/DrivesSync/Laptop/Photos/sub/IMG_2.jpg').toString(), 'jpegdata-2-longer-than-chunk');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/DrivesSync/Laptop/Notes/memo.md').toString(), '# memo');
  const manifest = JSON.parse(world.fileAt('fin-lab/FinResearchRaw/.drives-sync/manifest.json').toString());
  assert.equal(Object.keys(manifest.devices.dev1.folders.p.uploaded).length, 2);
  assert.ok(manifest.devices.dev1.folders.p.lastRun);
  assert.equal(Object.keys(manifest.files).length, 3, 'flow uploads are recorded for Stock too');
  // second run with one new and one deleted local file: only the new one goes up, nothing is deleted
  photos.splice(0, 1);
  photos.push(mk('IMG_3.jpg', 'jpegdata-3', 4000));
  const again = await core.runFlowMatching(ctx, { folders });
  assert.equal(again.uploaded, 1);
  assert.ok(world.fileAt('fin-lab/FinResearchRaw/DrivesSync/Laptop/Photos/IMG_1.jpg'), 'deleted local file stays');
  // Stock afterwards sees everything as already synced
  const stock = await core.runStockMatching(ctx);
  assert.equal(stock.synced, 0);
  assert.equal(stock.unchanged, 4);
});

await test('flow: braked without folders; automation preflight needs folders and an interval', async () => {
  const world = makeFakeWorld();
  const { ctx } = makeCtx(world);
  const res = await core.runFlowMatching(ctx, { folders: [] });
  assert.equal(res.braked, true);
  assert.ok(res.reasons.some((r) => r.includes('기기 폴더')));
  const pf = await core.automationPreflight(ctx, { folders: [], intervalMinutes: 0 });
  assert.equal(pf.ok, false);
  assert.ok(pf.reasons.some((r) => r.includes('실행 주기')));
  const ok = await core.automationPreflight(ctx, { folders: [{ label: 'X' }], intervalMinutes: 30 });
  assert.equal(ok.ok, true, JSON.stringify(ok.reasons));
});

await test('refresh-token auth refreshes lazily; auth url + pkce', async () => {
  let refreshes = 0;
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    refreshes++;
    const p = new URLSearchParams(init.body);
    assert.equal(p.get('grant_type'), 'refresh_token');
    return new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600, scope: core.GOOGLE_SCOPE_DRIVE }), { status: 200 });
  };
  const auth = new core.RefreshTokenGoogleAuth({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetch: fetchImpl });
  assert.equal((await auth.getAccessToken()).token, 'NEW');
  await auth.getAccessToken();
  assert.equal(refreshes, 1);
  const { verifier, challenge } = await core.pkcePair();
  assert.ok(verifier.length > 30 && challenge.length > 30);
  const url = core.googleAuthUrl({ clientId: 'c', redirectUri: 'https://x/y/', codeChallenge: challenge, state: 's' });
  assert.ok(url.includes('code_challenge_method=S256') && url.includes('access_type=offline'));
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
