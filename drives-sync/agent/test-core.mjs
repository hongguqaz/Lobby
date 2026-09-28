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

await test('every API read bypasses the browser HTTP cache (GitHub sends max-age=60)', async () => {
  const world = makeFakeWorld();
  const seen = [];
  const spy = (url, init) => { seen.push({ url, cache: init && init.cache, method: (init && init.method) || 'GET' }); return world.fetch(url, init); };
  const ctx = core.createContext({
    config: { device: { id: 'd', name: 'D' } },
    googleAuth: new core.StaticGoogleAuth({ accessToken: 'GTOKEN', scope: world.scope, fetch: spy }),
    githubAuth: new core.StaticGitHubAuth('GHTOKEN'), fetch: spy,
  });
  const pf = await core.preflight(ctx);
  assert.equal(pf.ok, true, JSON.stringify(pf.reasons));
  const gets = seen.filter((x) => x.method === 'GET');
  assert.ok(gets.length >= 5, 'expected several GETs');
  const cached = gets.filter((x) => x.cache !== 'no-store').map((x) => x.url);
  assert.deepEqual(cached, [], 'GETs that could hit the browser cache');
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

await test('brake: a fine-grained token without Contents is explained step by step, not as raw 403s', async () => {
  const world = makeFakeWorld({ canRead: false, canWrite: false, githubToken: 'github_pat_abc' });
  const pf = await core.preflight(makeCtx(world, { githubToken: 'github_pat_abc' }).ctx);
  assert.equal(pf.ok, false);
  assert.equal(pf.permission, true);
  assert.ok(pf.checks.find((c) => c.id === 'github.repo').ok, 'metadata still readable');
  const branch = pf.checks.find((c) => c.id === 'github.branch');
  assert.ok(branch && !branch.ok && branch.detail.includes('Contents') && branch.detail.includes('Fine-grained tokens') && branch.detail.includes('Read and write'), branch && branch.detail);
  assert.ok(pf.checks.find((c) => c.id === 'github.token').detail.includes('fine-grained'));
  assert.ok(pf.checks.find((c) => c.id === 'github.target').detail.includes('먼저'));
  assert.ok(pf.checks.find((c) => c.id === 'github.write').detail.includes('Contents(쓰기)'));
  assert.ok(!pf.reasons.some((r) => r.includes('HTTP 403')), 'no raw 403 noise: ' + pf.reasons.join(' | '));
  // read-only Contents: reads pass, only the write check fails
  const ro = makeFakeWorld({ canWrite: false, githubToken: 'github_pat_ro' });
  const pf2 = await core.preflight(makeCtx(ro, { githubToken: 'github_pat_ro' }).ctx);
  assert.ok(pf2.checks.find((c) => c.id === 'github.branch').ok && pf2.checks.find((c) => c.id === 'github.target').ok);
  assert.ok(!pf2.checks.find((c) => c.id === 'github.write').ok);
});

await test('classic token: the repo scope is read from X-OAuth-Scopes', async () => {
  let world = makeFakeWorld({ classicScopes: ['read:user'], githubToken: 'ghp_x' });
  let pf = await core.preflight(makeCtx(world, { githubToken: 'ghp_x' }).ctx);
  const sc = pf.checks.find((c) => c.id === 'github.scope');
  assert.ok(sc && !sc.ok && sc.detail.includes('repo') && sc.detail.includes('read:user'), sc && sc.detail);
  assert.ok(pf.checks.find((c) => c.id === 'github.token').detail.includes('classic'));
  world = makeFakeWorld({ classicScopes: ['repo', 'read:user'], githubToken: 'ghp_y' });
  pf = await core.preflight(makeCtx(world, { githubToken: 'ghp_y' }).ctx);
  assert.equal(pf.ok, true, JSON.stringify(pf.reasons));
  assert.equal(pf.checks.find((c) => c.id === 'github.scope').detail, 'repo, read:user');
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
  const msgs = res.commits.map((c) => world.git.commits.get(c.sha).message);
  assert.ok(msgs[0].endsWith('[skip ci]'), 'intermediate batch must not wake push workflows: ' + msgs[0]);
  assert.ok(!msgs[1].includes('[skip ci]'), 'final batch of a run wakes them once: ' + msgs[1]);
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

await test('stock: rides out a branch that moves three times under the commit and names the intruder', async () => {
  const world = makeFakeWorld();
  world.addFile('a.txt', world.rootId, 'A');
  world.conflictTimes = 3;
  const { ctx, logs } = makeCtx(world);
  const res = await core.runStockMatching(ctx);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.synced, 1);
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/a.txt').toString(), 'A');
  const retries = logs.filter((l) => l.msg.includes('브랜치 갱신 거부'));
  assert.equal(retries.length, 3);
  assert.ok(retries[0].msg.includes('fin-courier[bot]') && retries[0].msg.includes('Fin Courier: 0 new file(s)'), retries[0].msg);
  assert.ok(retries[0].msg.includes('not a fast forward'));
});

await test('stock: a refusal that is not about the branch moving stops at once with GitHub\'s reason, keeps earlier commits', async () => {
  const world = makeFakeWorld();
  world.addFile('a.txt', world.rootId, 'A');
  world.addFile('b.txt', world.rootId, 'B');
  world.addFile('c.txt', world.rootId, 'C');
  const { ctx, logs } = makeCtx(world);
  // first batch (2 files) succeeds, then the branch starts refusing every update
  const origFetch = world.fetch;
  let commits = 0;
  const gated = async (url, init) => {
    const res = await origFetch(url, init);
    if (/git\/refs\/heads/.test(url) && (init.method || 'GET') === 'PATCH' && res.ok) { commits++; if (commits === 1) world.refReject = 'Changes must be made through a pull request.'; }
    return res;
  };
  const ctx2 = core.createContext({ ...ctx, config: ctx.config, googleAuth: ctx.googleAuth, githubAuth: ctx.githubAuth, fetch: gated, log: ctx.log });
  const res = await core.runStockMatching(ctx2);
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('거부') && res.error.includes('pull request'), res.error);
  assert.equal(res.commits.length, 1, 'first batch kept');
  assert.equal(res.committed, 2);
  assert.ok(world.fileAt('fin-lab/FinResearchRaw/a.txt'), 'first batch is in the repo');
  assert.equal(world.fileAt('fin-lab/FinResearchRaw/c.txt'), null, 'later batch not committed');
  const patches = world.calls.filter((c) => c.startsWith('PATCH')).length;
  assert.ok(patches <= 3, `stopped early, PATCH calls: ${patches}`);
  assert.ok(logs.some((l) => l.level === 'error' && l.msg.includes('GitHub 커밋 실패로 중단')));
});

await test('flow: a GitHub refusal is reported with partial results instead of failing every file', async () => {
  const world = makeFakeWorld();
  world.refReject = 'Required status check "ci" is expected.';
  const mk = (relPath, content, mtime) => ({ relPath, size: content.length, lastModified: mtime, read: async () => new Blob([content]) });
  const files = Array.from({ length: 6 }, (_, i) => mk(`f${i}.txt`, `file ${i}`, 1000 + i));
  const { ctx } = makeCtx(world);
  const res = await core.runFlowMatching(ctx, { folders: [{ id: 'p', label: 'Photos', source: core.listFolderSource('Photos', files) }] });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Required status check'), res.error);
  assert.equal(res.commits.length, 0);
  const f = res.folders[0];
  assert.ok(f.failed.length + f.skipped.length + f.uploaded >= 6, JSON.stringify(f));
  assert.ok(f.skipped.some((x) => x.reason.includes('중단')) || f.failed.length > 0);
  assert.ok([...world.drive.files.values()].some((x) => x.name === 'f0.txt'), 'upload to Drive happened before the GitHub refusal');
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

await test('cloud: dispatches the repository sync workflow on demand; explains unknown inputs, a missing workflow, or no Actions permission', async () => {
  const world = makeFakeWorld();
  const { ctx } = makeCtx(world);
  const res = await core.dispatchStockWorkflow(ctx);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(world.dispatches.length, 1);
  assert.equal(world.dispatches[0].file, 'sync-gdrive.yml');
  assert.equal(world.dispatches[0].ref, 'main');
  assert.equal(world.dispatches[0].inputs.mode, 'import');
  assert.equal(res.workflow, 'Sync rooms with Google Drive');
  assert.ok(res.runsUrl.endsWith('/actions/workflows/sync-gdrive.yml'));
  // a workflow that does not know the inputs: asked again without them, and the note says so
  world.workflows['sync-gdrive.yml'].inputs = ['dry_run'];
  const older = await core.dispatchStockWorkflow(ctx);
  assert.equal(older.ok, true, JSON.stringify(older));
  assert.ok(older.note && older.note.includes('inputs'), older.note);
  assert.deepEqual(Object.keys(world.dispatches[1].inputs), []);
  // another workflow with its own inputs, chosen explicitly
  const own = await core.dispatchStockWorkflow(ctx, { workflowFile: 'drives-sync-stock.yml', inputs: { target_path: 'fin-lab/FinResearchRaw', source_folder_id: '', dry_run: 'false' } });
  assert.equal(own.ok, true, JSON.stringify(own));
  assert.equal(world.dispatches[2].inputs.target_path, 'fin-lab/FinResearchRaw');
  world.workflows = {};
  const missing = await core.dispatchStockWorkflow(ctx);
  assert.equal(missing.ok, false);
  assert.ok(missing.reasons[0].includes('sync-gdrive.yml'), missing.reasons[0]);
  world.workflows = { 'sync-gdrive.yml': { inputs: ['mode', 'entries', 'dry_run'] } };
  world.actionsPerm = false;
  const noperm = await core.dispatchStockWorkflow(ctx);
  assert.equal(noperm.ok, false);
  assert.ok(noperm.reasons[0].includes('Actions'), noperm.reasons[0]);
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
