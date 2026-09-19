#!/usr/bin/env node
/* Drives Sync - agent command line. Same engine and same brakes as the web app (../core.js).

   node drives-sync-cli.mjs preflight [--json]
   node drives-sync-cli.mjs stock [--dry-run] [--json]
   node drives-sync-cli.mjs flow --folder Label=/path/to/dir [--folder ...] [--dry-run] [--json]
   node drives-sync-cli.mjs status [--json]
   node drives-sync-cli.mjs auth [--port 53682]          obtain a Google refresh token (one time)

   Environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (or GOOGLE_ACCESS_TOKEN),
                GITHUB_TOKEN, DRIVES_SYNC_CONFIG (path to a config JSON), DRIVES_SYNC_DEVICE (device name).
   Exit codes: 0 done, 2 braked (preflight failed - nothing written), 1 error, 3 usage. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import * as core from '../core.js';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'help';
const flags = { folders: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') flags.json = true;
  else if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--folder') flags.folders.push(args[++i]);
  else if (a === '--config') flags.config = args[++i];
  else if (a === '--device') flags.device = args[++i];
  else if (a === '--port') flags.port = Number(args[++i]);
  else if (a === '--trigger') flags.trigger = args[++i];
  else if (a === '--drive-path') flags.drivePath = args[++i];
}

const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
const say = (s) => (flags.json ? process.stderr : process.stdout).write(s + '\n');

async function loadConfigFile() {
  const p = flags.config || process.env.DRIVES_SYNC_CONFIG || 'drives-sync.config.json';
  try { return { file: JSON.parse(await fs.readFile(p, 'utf8')), path: p }; } catch (e) {
    if (flags.config || process.env.DRIVES_SYNC_CONFIG) throw new Error(`설정 파일을 읽을 수 없습니다 (${p}): ${e.message}`);
    return { file: {}, path: null };
  }
}

function nodeFolderSource(root, label) {
  return {
    kind: 'node', name: label,
    async list() {
      const entries = [];
      const walk = async (dir, prefix) => {
        for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
          if (ent.name.startsWith('.') && ent.isDirectory()) continue;
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) await walk(p, prefix + ent.name + '/');
          else if (ent.isFile()) {
            const st = await fs.stat(p);
            entries.push({ relPath: prefix + ent.name, name: ent.name, size: st.size, lastModified: Math.round(st.mtimeMs), read: async () => new Blob([await fs.readFile(p)], { type: core.guessMime(ent.name) }) });
          }
        }
      };
      await walk(root, '');
      return entries;
    },
  };
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'folder'; }

async function buildContext() {
  const { file, path: cfgPath } = await loadConfigFile();
  const config = core.withDefaults(file.config || {});
  const env = process.env;
  if (env.DRIVES_SYNC_EXPECTED_EMAIL) config.google.expectedEmail = env.DRIVES_SYNC_EXPECTED_EMAIL;
  if (env.GOOGLE_CLIENT_ID) config.google.clientId = env.GOOGLE_CLIENT_ID;
  if (env.GOOGLE_CLIENT_SECRET) config.google.clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!config.device.id) config.device.id = 'cli-' + slug(os.hostname());
  config.device.name = flags.device || env.DRIVES_SYNC_DEVICE || config.device.name || `CLI ${os.hostname()}`;

  let googleAuth;
  if (env.GOOGLE_REFRESH_TOKEN) {
    googleAuth = new core.RefreshTokenGoogleAuth({ clientId: config.google.clientId, clientSecret: config.google.clientSecret, refreshToken: env.GOOGLE_REFRESH_TOKEN });
  } else {
    googleAuth = new core.StaticGoogleAuth({ accessToken: env.GOOGLE_ACCESS_TOKEN || null });
  }
  const githubAuth = new core.StaticGitHubAuth(env.GITHUB_TOKEN || null);
  const ctx = core.createContext({
    config, googleAuth, githubAuth,
    log: (level, msg) => say(`[${level}] ${msg}`),
    progress: (p) => { if (p.total && !flags.json) process.stdout.write(`\r  ${p.done}/${p.total} ${p.current || ''}`.slice(0, 120).padEnd(120) + (p.done === p.total ? '\n' : '')); },
    env: { githubActions: !!env.GITHUB_ACTIONS },
  });
  return { ctx, file, cfgPath };
}

function folderSpecs(file) {
  const specs = [];
  for (const f of file.folders || []) if (f.path) specs.push({ label: f.label || path.basename(f.path), path: f.path, driveSubPath: f.driveSubPath || '' });
  for (const s of flags.folders) {
    const eq = s.indexOf('=');
    const label = eq > 0 ? s.slice(0, eq) : path.basename(s);
    const p = eq > 0 ? s.slice(eq + 1) : s;
    specs.push({ label, path: p, driveSubPath: flags.drivePath || '' });
  }
  return specs.map((s) => ({ id: 'cli-' + slug(s.label), label: s.label, driveSubPath: s.driveSubPath, source: nodeFolderSource(path.resolve(s.path), s.label), path: path.resolve(s.path) }));
}

function printPreflight(pf) {
  for (const c of pf.checks) say(`  ${c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`);
  say(pf.ok ? '사전 점검 통과' : `사전 점검 실패 (${pf.reasons.length}): 작업하지 않습니다.`);
}

async function main() {
  if (command === 'help' || command === '--help' || command === '-h') {
    say(`Drives Sync CLI v${core.VERSION}\n  preflight | stock [--dry-run] | flow --folder Label=/path [...] [--dry-run] | status | auth [--port N]\n  --json 으로 결과를 JSON으로 출력합니다. 환경 변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN | GOOGLE_ACCESS_TOKEN, GITHUB_TOKEN, DRIVES_SYNC_CONFIG, DRIVES_SYNC_DEVICE`);
    return 3;
  }
  if (command === 'auth') return auth();
  const { ctx, file } = await buildContext();

  if (command === 'preflight') {
    const pf = await core.preflight(ctx, { scope: 'flow' });
    if (flags.json) out(pf); else printPreflight(pf);
    return pf.ok ? 0 : 2;
  }
  if (command === 'status') {
    const pf = await core.preflight(ctx, { scope: 'stock' });
    let manifest = null;
    if (pf.ok) {
      const m = await core.loadManifest(ctx.github, ctx.config.github.targetPath, ctx.config);
      manifest = { existed: m.existed, files: Object.keys(m.manifest.files).length, stock: m.manifest.stock, devices: Object.fromEntries(Object.entries(m.manifest.devices).map(([id, d]) => [id, { name: d.name, folders: Object.fromEntries(Object.entries(d.folders || {}).map(([fid, f]) => [fid, { label: f.label, drivePath: f.drivePath, lastRun: f.lastRun, uploaded: Object.keys(f.uploaded || {}).length }])) }])) };
    }
    const status = { version: core.VERSION, device: ctx.config.device, target: `${ctx.config.github.owner}/${ctx.config.github.repo}:${ctx.config.github.targetPath}`, preflight: { ok: pf.ok, reasons: pf.reasons }, manifest };
    if (flags.json) out(status); else { printPreflight(pf); if (manifest) say(`매니페스트: 파일 ${manifest.files}개, 마지막 Stock ${manifest.stock.lastRun || '없음'}`); }
    return pf.ok ? 0 : 2;
  }
  if (command === 'stock') {
    const res = await core.runStockMatching(ctx, { dryRun: !!flags.dryRun, trigger: flags.trigger || 'cli' });
    if (flags.json) out(res);
    else if (res.braked) { printPreflight(res.preflight); }
    else say(`${res.dryRun ? '미리 보기' : '완료'}: 대상 ${res.planned}, 동기화 ${res.synced}, 변경 없음 ${res.unchanged}, 건너뜀 ${res.skipped.length}, 실패 ${res.failed ? res.failed.length : 0}, 커밋 ${res.commits.length}`);
    return res.braked ? 2 : (res.ok ? 0 : 1);
  }
  if (command === 'flow') {
    const folders = folderSpecs(file);
    for (const f of folders) {
      try { const st = await fs.stat(f.path); if (!st.isDirectory()) throw new Error('폴더가 아닙니다'); } catch (e) {
        const reason = `폴더 "${f.label}" (${f.path}) 에 접근할 수 없습니다: ${e.message}`;
        const res = { ok: false, braked: true, reasons: [reason], at: core.nowIso() };
        if (flags.json) out(res); else say(`[brake] ${reason}`);
        return 2;
      }
    }
    const res = await core.runFlowMatching(ctx, { folders, dryRun: !!flags.dryRun, trigger: flags.trigger || 'cli' });
    if (flags.json) out(res);
    else if (res.braked) printPreflight(res.preflight || { checks: [], reasons: res.reasons, ok: false });
    else say(`${res.dryRun ? '미리 보기' : '완료'}: 업로드 ${res.uploaded}, 실패 ${res.failed}, 커밋 ${res.commits.length}`);
    return res.braked ? 2 : (res.ok ? 0 : 1);
  }
  say(`알 수 없는 명령: ${command}`);
  return 3;
}

/** One-time: get a Google refresh token through a loopback redirect (register http://localhost:PORT/ in Google Cloud). */
async function auth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) { say('GOOGLE_CLIENT_ID 와 GOOGLE_CLIENT_SECRET 환경 변수가 필요합니다.'); return 3; }
  const port = flags.port || 53682;
  const redirectUri = `http://localhost:${port}/`;
  const { verifier, challenge } = await core.pkcePair();
  const state = core.randomId(8);
  const url = core.googleAuthUrl({ clientId, redirectUri, codeChallenge: challenge, state, loginHint: process.env.DRIVES_SYNC_EXPECTED_EMAIL });
  say(`브라우저에서 아래 주소를 여세요 (리디렉션 URI ${redirectUri} 가 Google Cloud에 등록되어 있어야 합니다):\n\n${url}\n`);
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, redirectUri);
      if (!u.searchParams.get('code')) { res.writeHead(404); res.end(); return; }
      try {
        if (u.searchParams.get('state') !== state) throw new Error('state 불일치');
        const data = await core.googleTokenRequest(fetch, { code: u.searchParams.get('code'), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p>Drives Sync: 인증 완료. 이 창을 닫아도 됩니다.</p>');
        if (!data.refresh_token) say('refresh token이 없습니다. Google 계정의 타사 액세스에서 이 앱을 제거한 뒤 다시 시도하세요.');
        else { say('\n아래 값을 GOOGLE_REFRESH_TOKEN 환경 변수(또는 저장소 비밀)에 저장하세요:\n'); say(data.refresh_token); }
        server.close();
        resolve(data.refresh_token ? 0 : 1);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('인증 실패: ' + e.message);
        say('인증 실패: ' + e.message);
        server.close();
        resolve(1);
      }
    });
    server.listen(port, () => say(`localhost:${port} 에서 리디렉션을 기다립니다...`));
  });
}

main().then((code) => process.exit(code), (e) => { say(`[error] ${e.message}`); if (flags.json) out({ ok: false, error: e.message }); process.exit(1); });
