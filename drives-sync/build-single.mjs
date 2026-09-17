#!/usr/bin/env node
/* Builds the one-file edition of Drives Sync: index.html with the stylesheets, the engine, the
   app script and the icons inlined, so a single drives-sync.html can be hosted anywhere.

   node drives-sync/build-single.mjs                       -> drives-sync/drives-sync.html
   node drives-sync/build-single.mjs --preview --out X     -> a body fragment (no <html>/<head>/<body>)
                                                              for hosts that block outside connections,
                                                              such as a claude.ai artifact: the UI runs,
                                                              syncing is disabled and the page says so. */
import fs from 'node:fs/promises';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const preview = args.includes('--preview');
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(HERE, 'drives-sync.html');

const read = (p) => fs.readFile(path.join(HERE, p), 'utf8');
const dataUri = async (p, mime) => `data:${mime};base64,${(await fs.readFile(path.join(HERE, p))).toString('base64')}`;

const html = await read('index.html');
const tokens = await read('../assets/tokens.css');
const css = await read('drives-sync.css');
let core = await read('core.js');
let app = await read('app.js');
const iconSvg = await dataUri('assets/icon.svg', 'image/svg+xml');
const icon192 = await dataUri('assets/icon-192.png', 'image/png');
const icon512 = await dataUri('assets/icon-512.png', 'image/png');
const iconMaskable = await dataUri('assets/icon-maskable-512.png', 'image/png');
const appleIcon = await dataUri('assets/apple-touch-icon.png', 'image/png');

// core.js becomes a `core` namespace object; app.js drops its import and uses it as before.
const names = [...core.matchAll(/^export (?:const|let|function|async function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
core = core.replace(/^export (?=(?:const|let|function|async function|class) )/gm, '');
if (/^export\b/m.test(core)) throw new Error('core.js has an export form this build does not handle');
app = app.replace(/^import \* as core from '\.\/core\.js';[ \t]*\r?\n/m, '');
if (/^import\b/m.test(app)) throw new Error('app.js has an import this build does not handle');
const script = `const core = (() => {\n${core}\nreturn { ${names.join(', ')} };\n})();\n${app}`;
if (script.includes('</script')) throw new Error('inline script would close the script tag');

const version = (/VERSION = '([^']+)'/.exec(core) || [])[1] || '';
const flag = `<script>window.DRIVES_SYNC_BUILD = ${JSON.stringify({ single: true, preview, version, builtAt: new Date().toISOString(), icon192, icon512, iconMaskable })};</script>`;

let out = html;
const replace = (from, to) => { if (!out.includes(from)) throw new Error('index.html changed; marker not found: ' + from.slice(0, 60)); out = out.replace(from, to); };
replace('  <link rel="manifest" href="manifest.webmanifest">\n', '');
replace('<link rel="icon" href="assets/icon.svg" type="image/svg+xml">', `<link rel="icon" href="${iconSvg}" type="image/svg+xml">`);
replace('<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">', `<link rel="apple-touch-icon" href="${appleIcon}">`);
replace('<link rel="stylesheet" href="../assets/tokens.css">\n  <link rel="stylesheet" href="drives-sync.css">', `<style>\n${tokens}\n${css}</style>`);
replace('<img class="logo" src="assets/icon.svg"', `<img class="logo" src="${iconSvg}"`);
replace('<a class="btn-ghost link" href="../">Lobby</a>', '<a class="btn-ghost link" href="https://hongguqaz.github.io/Lobby/">Lobby</a>');
replace('<script type="module" src="app.js"></script>', `${flag}\n  <script type="module">\n${script}\n  </script>`);
replace('<title>Drives Sync</title>', `<title>Drives Sync</title>\n  <!-- Drives Sync v${version}, one-file edition built ${new Date().toISOString().slice(0, 10)} by build-single.mjs from index.html, core.js and app.js. Source: https://github.com/hongguqaz/Lobby/tree/main/drives-sync -->`);
if (preview) replace('  <script src="https://accounts.google.com/gsi/client" async defer></script>\n', '');

if (preview) {
  // A fragment: <title> and <style> first, then the page body. The host wraps it in its own document.
  const style = /<style>[\s\S]*?<\/style>/.exec(out)[0];
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(out)[1];
  out = `<title>Drives Sync</title>\n${style}\n${body}`;
}

await fs.writeFile(outFile, out);
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${(out.length / 1024).toFixed(0)} KB${preview ? ', preview fragment' : ''})`);
