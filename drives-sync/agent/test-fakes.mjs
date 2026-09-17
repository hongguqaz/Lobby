/* Drives Sync - fake Google Drive + GitHub APIs for tests and local dry runs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as core from '../core.js';

const FOLDER = core.GOOGLE_FOLDER;

/** A fake of the two APIs the engine talks to: enough of Drive v3 and the GitHub Git Data API. */
export function makeFakeWorld({ email = 'honggusangjoon@gmail.com', login = 'hongguqaz', canWrite = true, targetExists = true, scope = core.GOOGLE_SCOPE_DRIVE } = {}) {
  const drive = {
    files: new Map(),   // id -> {id, name, mimeType, parents, size, md5Checksum, modifiedTime, content}
    nextId: 1,
    uploads: new Map(), // session -> {meta, fileId, chunks: []}
  };
  const rootId = 'ROOT';
  drive.files.set(rootId, { id: rootId, name: 'My Drive', mimeType: FOLDER, parents: [] });
  const addFile = (name, parentId, content, mimeType = 'application/octet-stream') => {
    const id = 'f' + drive.nextId++;
    const buf = Buffer.from(content);
    drive.files.set(id, { id, name, mimeType, parents: [parentId], size: String(buf.length), md5Checksum: createHash('md5').update(buf).digest('hex'), modifiedTime: '2026-09-01T00:00:00.000Z', content: buf });
    return id;
  };
  const addFolder = (name, parentId) => {
    const id = 'd' + drive.nextId++;
    drive.files.set(id, { id, name, mimeType: FOLDER, parents: [parentId], modifiedTime: '2026-09-01T00:00:00.000Z' });
    return id;
  };
  const addGoogleDoc = (name, parentId, text) => {
    const id = 'g' + drive.nextId++;
    drive.files.set(id, { id, name, mimeType: 'application/vnd.google-apps.document', parents: [parentId], modifiedTime: '2026-09-02T00:00:00.000Z', content: Buffer.from(text) });
    return id;
  };

  const git = { blobs: new Map(), trees: new Map(), commits: new Map(), branch: 'main', head: null, defaultBranch: 'main' };
  const sha = (s) => createHash('sha1').update(s).digest('hex');
  const makeTree = (entries) => { const id = sha('tree' + JSON.stringify([...entries.entries()].sort())); git.trees.set(id, new Map(entries)); return id; };
  const makeCommit = (tree, parents, message) => { const id = sha('commit' + tree + parents.join() + message + git.commits.size); git.commits.set(id, { tree, parents, message }); return id; };
  const initialTree = new Map([['README.md', sha('readme')]]);
  if (targetExists) initialTree.set('fin-lab/FinResearchRaw/README.md', sha('target readme'));
  git.blobs.set(sha('readme'), 'README');
  git.blobs.set(sha('target readme'), 'FinResearchRaw');
  git.head = makeCommit(makeTree(initialTree), [], 'init');
  const headTree = () => git.trees.get(git.commits.get(git.head).tree);
  const calls = [];

  // Browsers may read Location/Range on cross-origin responses only when the server exposes them, as Google's upload servers do.
  const json = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'Access-Control-Expose-Headers': 'Location, Range', ...headers } });

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    calls.push(`${method} ${u.host}${u.pathname}`);
    const auth = init.headers?.Authorization || init.headers?.authorization || '';

    // ---- Google
    if (u.host === 'www.googleapis.com') {
      if (auth !== 'Bearer GTOKEN') return json(401, { error: { message: 'Invalid Credentials' } });
      if (u.pathname === '/drive/v3/about') return json(200, { user: { emailAddress: world.email, displayName: 'Tester' } });
      if (u.pathname === '/drive/v3/files' && method === 'GET') {
        const q = u.searchParams.get('q') || '';
        let files = [...drive.files.values()].filter((f) => f.id !== rootId);
        const parentM = /'([^']+)' in parents/.exec(q);
        if (parentM) files = files.filter((f) => f.parents.includes(parentM[1]));
        const nameM = /name = '((?:[^'\\]|\\.)*)'/.exec(q);
        if (nameM) files = files.filter((f) => f.name === nameM[1].replace(/\\(.)/g, '$1'));
        if (q.includes(`mimeType = '${FOLDER}'`)) files = files.filter((f) => f.mimeType === FOLDER);
        return json(200, { files: files.map(({ content, ...rest }) => rest) });
      }
      if (u.pathname === '/drive/v3/files' && method === 'POST') {
        const body = JSON.parse(init.body);
        const id = 'd' + drive.nextId++;
        drive.files.set(id, { id, name: body.name, mimeType: body.mimeType, parents: body.parents, modifiedTime: new Date().toISOString() });
        return json(200, { id, name: body.name });
      }
      const fileM = /^\/drive\/v3\/files\/([^/]+)(\/export)?$/.exec(u.pathname);
      if (fileM) {
        const id = decodeURIComponent(fileM[1]) === 'root' ? rootId : decodeURIComponent(fileM[1]);
        const f = drive.files.get(id);
        if (!f) return json(404, { error: { message: 'File not found' } });
        if (fileM[2]) return new Response(Buffer.from('EXPORTED:' + f.content.toString()), { status: 200 });
        if (u.searchParams.get('alt') === 'media') return new Response(f.content, { status: 200 });
        const { content, ...rest } = f;
        return json(200, rest);
      }
      if (u.pathname.startsWith('/upload/drive/v3/files')) {
        const existingId = u.pathname.split('/')[5];
        if (u.searchParams.get('uploadType') === 'resumable') {
          const session = `https://www.googleapis.com/upload/session/${drive.nextId++}`;
          drive.uploads.set(session, { meta: JSON.parse(init.body), fileId: existingId, chunks: [], type: init.headers['X-Upload-Content-Type'] });
          return json(200, null, { Location: session });
        }
        return json(400, { error: { message: 'bad upload' } });
      }
      if (u.pathname.startsWith('/upload/session/')) {
        const s = drive.uploads.get(url);
        if (!s) return json(404, { error: { message: 'no session' } });
        const range = init.headers['Content-Range'] || '';
        const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(range);
        const buf = Buffer.from(await new Response(init.body).arrayBuffer());
        s.chunks.push(buf);
        const total = m ? Number(m[3]) : buf.length;
        const received = s.chunks.reduce((n, c) => n + c.length, 0);
        if (received < total) return new Response(null, { status: 308, headers: { Range: `bytes=0-${received - 1}`, 'Access-Control-Expose-Headers': 'Location, Range' } });
        const content = Buffer.concat(s.chunks);
        const id = s.fileId || 'u' + drive.nextId++;
        const prev = drive.files.get(id) || {};
        const rec = { id, name: s.meta.name || prev.name, mimeType: s.type || 'application/octet-stream', parents: s.meta.parents || prev.parents, size: String(content.length), md5Checksum: createHash('md5').update(content).digest('hex'), modifiedTime: s.meta.modifiedTime || new Date().toISOString(), content };
        drive.files.set(id, rec);
        const { content: _c, ...rest } = rec;
        return json(200, rest);
      }
      return json(404, { error: { message: 'unknown google endpoint ' + u.pathname } });
    }

    // ---- GitHub
    if (u.host === 'api.github.com') {
      if (auth !== 'Bearer GHTOKEN') return json(401, { message: 'Bad credentials' });
      if (u.pathname === '/user') return json(200, { login });
      const repoBase = '/repos/hongguqaz/Drive';
      if (!u.pathname.startsWith(repoBase)) return json(404, { message: 'Not Found' });
      const rest = u.pathname.slice(repoBase.length);
      if (rest === '') return json(200, { full_name: 'hongguqaz/Drive', private: true, default_branch: git.defaultBranch, permissions: { push: canWrite } });
      if (rest.startsWith('/contents/')) {
        const path = decodeURIComponent(rest.slice('/contents/'.length));
        const tree = headTree();
        if (tree.has(path)) {
          if ((init.headers.Accept || '').includes('raw')) return new Response(git.blobs.get(tree.get(path)), { status: 200 });
          return json(200, { type: 'file', path });
        }
        const children = [...tree.keys()].filter((k) => k.startsWith(path + '/'));
        if (children.length) return json(200, children.map((k) => ({ path: k, type: 'file' })));
        return json(404, { message: 'Not Found' });
      }
      if (rest === '/git/blobs' && method === 'POST') {
        if (!canWrite) return json(403, { message: 'Resource not accessible by personal access token' });
        const body = JSON.parse(init.body);
        const content = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content, 'utf8');
        const id = sha('blob' + content.toString('base64'));
        git.blobs.set(id, content);
        return json(201, { sha: id });
      }
      const refM = /^\/git\/ref\/heads\/(.+)$/.exec(rest);
      if (refM && method === 'GET') {
        if (decodeURIComponent(refM[1]) !== git.branch) return json(404, { message: 'Not Found' });
        return json(200, { object: { sha: git.head } });
      }
      const commitM = /^\/git\/commits\/(.+)$/.exec(rest);
      if (commitM && method === 'GET') { const c = git.commits.get(commitM[1]); return c ? json(200, { sha: commitM[1], tree: { sha: c.tree } }) : json(404, { message: 'no commit' }); }
      if (rest === '/git/trees' && method === 'POST') {
        if (!canWrite) return json(403, { message: 'forbidden' });
        const body = JSON.parse(init.body);
        const base = new Map(git.trees.get(body.base_tree));
        for (const e of body.tree) {
          if (e.content !== undefined) { const id = sha('blob' + Buffer.from(e.content).toString('base64')); git.blobs.set(id, Buffer.from(e.content)); base.set(e.path, id); } else { assert.ok(git.blobs.has(e.sha), 'tree references unknown blob'); base.set(e.path, e.sha); }
        }
        return json(201, { sha: makeTree(base) });
      }
      if (rest === '/git/commits' && method === 'POST') {
        if (!canWrite) return json(403, { message: 'forbidden' });
        const body = JSON.parse(init.body);
        const id = makeCommit(body.tree, body.parents, body.message);
        return json(201, { sha: id, html_url: `https://github.com/hongguqaz/Drive/commit/${id}` });
      }
      const patchM = /^\/git\/refs\/heads\/(.+)$/.exec(rest);
      if (patchM && method === 'PATCH') {
        const body = JSON.parse(init.body);
        const c = git.commits.get(body.sha);
        if (!c || c.parents[0] !== git.head) return json(422, { message: 'Update is not a fast forward' });
        if (world.conflictOnce) { world.conflictOnce = false; git.head = makeCommit(c.tree, [git.head], 'someone else'); return json(422, { message: 'Update is not a fast forward' }); }
        git.head = body.sha;
        return json(200, { object: { sha: git.head } });
      }
      return json(404, { message: 'unknown github endpoint ' + rest });
    }
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/tokeninfo') return json(200, { scope: world.scope, email: world.email });
    return json(404, { message: 'unknown host ' + u.host });
  }

  const world = { drive, git, calls, rootId, addFile, addFolder, addGoogleDoc, fetch: fetchImpl, headTree, conflictOnce: false, email, scope,
    fileAt: (path) => { const t = headTree(); return t.has(path) ? git.blobs.get(t.get(path)) : null; } };
  return world;
}

export function makeCtx(world, { googleToken = 'GTOKEN', githubToken = 'GHTOKEN', config = {}, scope } = {}) {
  const logs = [];
  return {
    logs,
    ctx: core.createContext({
      config: core.deepMerge({ device: { id: 'dev1', name: 'Laptop' }, limits: { batchFiles: 2, batchBytes: 1024 * 1024, uploadChunkBytes: 4 } }, config),
      googleAuth: new core.StaticGoogleAuth({ accessToken: googleToken, scope: scope ?? world.scope, fetch: world.fetch }),
      githubAuth: new core.StaticGitHubAuth(githubToken),
      fetch: world.fetch,
      log: (level, msg, data) => logs.push({ level, msg, data }),
    }),
  };
}

