#!/usr/bin/env python3
"""Builds the room pages (fin-lab, legal-quarter, library, maiden-hall, garden,
bedroom) from one template.  Run from the repository root:

    python3 tools/build_rooms.py

Each page shows assets/img/<room>.jpg when that file exists and the drawn SVG
scene otherwise; film grain and a vignette are laid over either."""
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
random.seed(11)

NOISE = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>"
         "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/>"
         "<feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 .34'/></feComponentTransfer></filter>"
         "<rect width='240' height='240' filter='url(%23n)'/></svg>")

# shared filters every scene can use
FILTERS = '''
      <filter id="wood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .35" numOctaves="4" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .1 .34"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="plaster" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" seed="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 .16"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="fabric" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .5" numOctaves="3" seed="4"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .05 .3"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="grass" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".5 .9" numOctaves="3" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 .2  0 0 0 0 .32  0 0 0 0 .12  0 0 0 .6 -.14"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="clouds" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .012" numOctaves="5" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .99  0 0 0 0 .97  0 0 0 11 -5.6"/><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="soft4" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="soft12" x="-50%" y="-120%" width="200%" height="340%"><feGaussianBlur stdDeviation="12"/></filter>
      <filter id="soft30" x="-60%" y="-160%" width="220%" height="420%"><feGaussianBlur stdDeviation="30"/></filter>
      <filter id="leaf" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G"/></filter>
'''


def shell(room_id, name, palette, scene, body, extra_scripts='', gated=True):
    gate = ('<script src="../assets/gate.js"></script>\n  <script>LobbyGate.require("%s", "%s");</script>' % (room_id, name)) if gated else ''
    return ('''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%(name)s - Lobby</title>
  <link rel="stylesheet" href="../assets/rooms.css">
  <link rel="stylesheet" href="../assets/gate.css">
  <style>
%(palette)s
  </style>
  %(gate)s
</head>
<body class="room">
  <div class="scene-wrap" aria-hidden="true">
%(scene)s
    <img class="scene-photo" src="../assets/img/%(room)s.jpg" alt="" width="1920" height="1080" onerror="this.remove()">
  </div>
  <div class="room-wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Lobby</a><span aria-hidden="true">/</span><span aria-current="page">%(name)s</span></nav>
%(body)s
  </div>
%(scripts)s
</body>
</html>
''') % dict(name=name, palette=palette, gate=gate, scene=scene, room=room_id, body=body, scripts=extra_scripts)


def scene(inner, extra_defs=''):
    return ('  <svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">\n    <defs>' + FILTERS + extra_defs + '    </defs>\n' + inner + '\n  </svg>')


def placard(title, text, tag):
    return '      <section class="placard"><h2>%s</h2><p>%s</p><span class="soon">%s</span></section>' % (title, text, tag)


# ====================================================================== FIN LAB
def fin_lab():
    rnd = random.Random(3)
    sky = []
    for i in range(40):
        w = rnd.randint(26, 80); x = 200 + i * 31 + rnd.randint(-6, 6); hgt = rnd.randint(90, 340)
        top = 560 - hgt
        sky.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#0f1729"/>' % (x, top, w, hgt))
        sky.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#1b2740" opacity=".6"/>' % (x, top, 3, hgt))
        for r in range(hgt // 20):
            for c in range(max(1, w // 13)):
                if rnd.random() < 0.4:
                    sky.append('<rect x="%d" y="%d" width="6" height="9" fill="%s" opacity="%s"/>' % (x + 4 + c * 13, top + 6 + r * 20, rnd.choice(["#ffd27a", "#ffe4a8", "#9fc4ff", "#ffb07a"]), rnd.choice([".35", ".6", ".85"])))
    skyline = ''.join(sky)
    def monitor(x, y, w, hh, label):
        grid = ''.join('<line x1="%d" y1="%.0f" x2="%d" y2="%.0f" stroke="#1e3557" stroke-width="1"/>' % (x + 8, y + 8 + i * (hh - 16) / 4, x + w - 8, y + 8 + i * (hh - 16) / 4) for i in range(5))
        return ('<rect x="%d" y="%d" width="%d" height="%d" rx="5" fill="#070d18" stroke="#2a3a55" stroke-width="3"/>%s'
                '<rect x="%d" y="%d" width="%d" height="%d" rx="5" fill="url(#screenSheen)"/>'
                '<text x="%.0f" y="%.0f" text-anchor="middle" font-size="13" font-family="ui-monospace, Menlo, monospace" fill="#33507a" letter-spacing="3">%s</text>'
                '<rect x="%.0f" y="%d" width="28" height="22" fill="#1a2436"/><rect x="%.0f" y="%d" width="80" height="6" rx="3" fill="#1a2436"/>'
                '<rect x="%d" y="%d" width="%d" height="30" fill="url(#floorRefl)" opacity=".35" transform="translate(0,%d) scale(1,-1) translate(0,-%d)"/>'
                % (x, y, w, hh, grid, x, y, w, hh, x + w / 2, y + hh / 2 + 5, label, x + w / 2 - 14, y + hh, x + w / 2 - 40, y + hh + 20, x, y + hh + 26, w, 2 * (y + hh + 26) + 30, 0))
    defs = '''
      <linearGradient id="fl-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a101c"/><stop offset="1" stop-color="#121c30"/></linearGradient>
      <linearGradient id="fl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1530"/><stop offset=".55" stop-color="#22305a"/><stop offset=".85" stop-color="#5c3f55"/><stop offset="1" stop-color="#8a4f45"/></linearGradient>
      <linearGradient id="fl-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2334"/><stop offset="1" stop-color="#080c14"/></linearGradient>
      <linearGradient id="screenSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".08"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <linearGradient id="floorRefl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fa3ff" stop-opacity=".25"/><stop offset="1" stop-color="#4fa3ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="glassRefl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".12"/><stop offset=".4" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity=".05"/></linearGradient>
      <radialGradient id="fl-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb454" stop-opacity=".45"/><stop offset=".5" stop-color="#ffb454" stop-opacity=".12"/><stop offset="1" stop-color="#ffb454" stop-opacity="0"/></radialGradient>
      <radialGradient id="fl-screen" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#4fa3ff" stop-opacity=".2"/><stop offset="1" stop-color="#4fa3ff" stop-opacity="0"/></radialGradient>
'''
    inner = '''    <rect width="1600" height="900" fill="url(#fl-wall)"/>
    <rect width="1600" height="900" filter="url(#plaster)" opacity=".5"/>
    <rect x="190" y="70" width="1220" height="500" fill="url(#fl-sky)"/>
    <rect x="190" y="360" width="1220" height="210" fill="#c98a5a" opacity=".12" filter="url(#soft30)"/>
    %s
    <rect x="190" y="70" width="1220" height="500" fill="url(#glassRefl)"/>
    <rect x="190" y="70" width="1220" height="500" fill="none" stroke="#1c2739" stroke-width="16"/>
    <path d="M500,70 V570 M800,70 V570 M1100,70 V570 M190,320 H1410" stroke="#1c2739" stroke-width="10"/>
    <path d="M500,70 V570 M800,70 V570 M1100,70 V570" stroke="#2f3d55" stroke-width="2"/>
    <rect x="0" y="570" width="1600" height="330" fill="url(#fl-floor)"/>
    <rect x="0" y="566" width="1600" height="8" fill="#1e2a3d"/>
    <ellipse cx="800" cy="640" rx="720" ry="150" fill="url(#fl-screen)"/>
    <rect x="230" y="640" width="500" height="26" rx="4" fill="#27364c"/><rect x="230" y="666" width="500" height="120" fill="#1a2536"/><rect x="230" y="640" width="500" height="26" filter="url(#wood)" opacity=".5"/>
    <rect x="870" y="640" width="500" height="26" rx="4" fill="#27364c"/><rect x="870" y="666" width="500" height="120" fill="#1a2536"/><rect x="870" y="640" width="500" height="26" filter="url(#wood)" opacity=".5"/>
    %s%s%s%s
    <circle cx="1400" cy="600" r="190" fill="url(#fl-lamp)"/>
    <rect x="1385" y="560" width="8" height="90" fill="#2b2f3a"/><path d="M1350,565 h78 l-12,-26 h-54 z" fill="#3a3f4c"/><path d="M1352,563 h74" stroke="#ffd9a0" stroke-width="2" opacity=".7"/>
    <ellipse cx="1389" cy="652" rx="60" ry="8" fill="#000" opacity=".4" filter="url(#soft4)"/>
    <rect x="720" y="600" width="22" height="30" rx="4" fill="#d9d2c5"/><path d="M742,608 q14,4 0,16" fill="none" stroke="#d9d2c5" stroke-width="4"/><ellipse cx="731" cy="632" rx="16" ry="4" fill="#000" opacity=".35" filter="url(#soft4)"/>
    <g filter="url(#leaf)"><path d="M120,720 q-40,-90 30,-130 q20,70 -30,130 M120,720 q60,-70 40,-150 q-70,50 -40,150 M120,720 q-10,-100 60,-110 q-10,70 -60,110" fill="#1f4a3a"/></g><rect x="100" y="716" width="46" height="44" rx="6" fill="#3a3f4c"/>
    <ellipse cx="800" cy="890" rx="900" ry="80" fill="#000" opacity=".5" filter="url(#soft30)"/>
    <rect x="0" y="0" width="1600" height="44" fill="#070b14" opacity=".92"/>''' % (skyline, monitor(270, 500, 180, 110, 'NO FEED'), monitor(470, 480, 220, 130, 'AWAITING DATA'), monitor(910, 480, 220, 130, 'NO FEED'), monitor(1150, 500, 180, 110, 'AWAITING DATA'))
    palette = '''    :root { --room-bg: #0d1320; --room-ink: #e8edf5; --room-ink-2: #c3cddc; --room-muted: #8a97ad; --room-accent: #4fa3ff;
      --room-panel: rgba(16, 26, 44, 0.66); --room-line: rgba(140, 170, 220, 0.22); --room-radius: 8px; --room-text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.65); }
    .ticker { position: fixed; top: 0; left: 0; right: 0; z-index: 5; overflow: hidden; background: rgba(6, 10, 20, 0.88); border-bottom: 1px solid rgba(255,255,255,0.08);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #9fb3d1; }
    .room-wrap { padding-top: 58px; }
    .ticker-track { display: inline-flex; gap: 44px; white-space: nowrap; padding: 9px 0; animation: tick 60s linear infinite; }
    .ticker-track span b { color: #e8edf5; font-weight: 600; } .ticker-track span i { color: #5f7290; font-style: normal; margin-left: 8px; }
    @keyframes tick { to { transform: translateX(-50%); } }
    .lab { margin-top: 26px; display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 22px; align-items: start; }
    .guide { background: var(--room-panel); border: 1px solid var(--room-line); border-radius: 12px; padding: 16px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    /* the analyst: a photographic figure that turns toward the pointer, breathes, and nods when clicked */
    .figure { position: relative; perspective: 900px; cursor: pointer; outline: none; border-radius: 10px; }
    .figure:focus-visible { box-shadow: 0 0 0 2px var(--room-accent); }
    .figure-tilt { transform-style: preserve-3d; transition: transform 0.18s ease-out; border-radius: 10px; overflow: hidden; background: #0b1120 url(assets/analyst-bg.jpg) center / cover; box-shadow: 0 18px 40px rgba(0,0,0,0.55); }
    .figure-tilt { position: relative; }
    .figure-photo { display: block; width: 100%; height: auto; aspect-ratio: 2 / 3; object-fit: cover; animation: breathe 5.2s ease-in-out infinite; transform-origin: 50% 90%; }
    .figure-photo.frame { position: absolute; inset: 0; height: 100%; opacity: 0; transition: opacity 0.32s ease; }
    .figure-photo.frame.on { opacity: 1; }
    .figure-photo.frame.fast { transition-duration: 0.12s; }
    @keyframes breathe { 50% { transform: scale(1.012) translateY(-1px); } }
    .figure-glow { position: absolute; inset: 0; background: radial-gradient(60% 45% at 18% 42%, rgba(79,163,255,0.28), rgba(79,163,255,0) 70%); mix-blend-mode: screen; animation: monitor 3.4s ease-in-out infinite alternate; pointer-events: none; }
    @keyframes monitor { to { opacity: 0.45; } }
    .figure-shine { position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 60%); transform: translateX(-120%); pointer-events: none; }
    .figure.waving .figure-shine { animation: shine 1.1s ease-out 1; }
    @keyframes shine { to { transform: translateX(120%); } }
    .figure.waving .figure-tilt { animation: nod 0.55s ease-in-out 2; }
    @keyframes nod { 50% { transform: rotateX(7deg) scale(1.02); } }
    .figure-ring { position: absolute; inset: -4px; border-radius: 14px; border: 2px solid var(--room-accent); opacity: 0; pointer-events: none; }
    .figure.waving .figure-ring { animation: ring 0.9s ease-out 1; }
    @keyframes ring { 0% { opacity: 0.9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.06); } }
    .figure.talking .figure-tilt { box-shadow: 0 18px 40px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(79,163,255,0.55); }
    .nameplate { margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--room-muted); letter-spacing: 0.06em; text-transform: uppercase; }
    .nameplate .lang { display: inline-flex; gap: 4px; }
    .nameplate button { font: inherit; font-size: 11px; color: var(--room-muted); background: transparent; border: 1px solid var(--room-line); border-radius: 6px; padding: 2px 7px; cursor: pointer; }
    .nameplate button[aria-pressed="true"] { color: var(--room-ink); border-color: var(--room-accent); }
    .bubble { position: relative; margin-top: 12px; background: #f4f6fa; color: #16202f; border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.5; min-height: 66px; }
    .bubble::before { content: ""; position: absolute; top: -9px; left: 36px; border: 9px solid transparent; border-top: 0; border-bottom-color: #f4f6fa; }
    .bubble .caret { display: inline-block; width: 2px; height: 1em; background: #16202f; vertical-align: -2px; margin-left: 1px; animation: blinkcaret 1s steps(2) infinite; }
    @keyframes blinkcaret { 50% { opacity: 0; } }
    .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .chips button, .chips a { font: inherit; font-size: 12px; color: var(--room-ink); background: rgba(79, 163, 255, 0.12); border: 1px solid rgba(79, 163, 255, 0.35); border-radius: 999px; padding: 4px 10px; cursor: pointer; text-decoration: none; }
    .chips button:hover, .chips a:hover { background: rgba(79, 163, 255, 0.24); }
    @media (prefers-reduced-motion: reduce) { .figure-photo, .figure-glow, .figure.waving .figure-tilt, .figure.waving .figure-shine, .figure.waving .figure-ring, .ticker-track { animation: none !important; } .figure-tilt, .figure-photo.frame { transition: none; } }
    @media (max-width: 760px) { .lab { grid-template-columns: 1fr; } }
'''
    ticker_items = ''.join('<span><b>%s</b><i>&mdash; awaiting feed</i></span>' % n for n in ['KOSPI', 'KOSDAQ', 'S&amp;P 500', 'NASDAQ', 'USD/KRW', 'US 10Y', 'KR 3Y', 'WTI', 'GOLD', 'BTC'])
    body = '''    <div class="ticker" aria-hidden="true"><div class="ticker-track">%s%s</div></div>
    <header class="room-head">
      <h1>Fin Lab</h1>
      <span class="status">Keyed &middot; desks ready, feeds pending</span>
    </header>
    <p class="room-desc">The trading-floor office of the house. Market commentary and analyst reports will accumulate here, and the Market Board
      outside the gate will draw on them. Sources and links are still being arranged; for now the analyst on duty will show you around.</p>
    <div class="lab">
      <aside class="guide" aria-label="The analyst">
        <div class="figure" id="figure" tabindex="0" role="img" aria-label="The Fin Lab analyst at her desk. Click to get her attention.">
          <div class="figure-tilt" id="figure-tilt">
            <img class="figure-photo base" src="assets/analyst.jpg" alt="" width="768" height="1152">
            <img class="figure-photo frame" alt="" aria-hidden="true">
            <img class="figure-photo frame" alt="" aria-hidden="true">
            <div class="figure-glow"></div>
            <div class="figure-shine"></div>
          </div>
          <div class="figure-ring"></div>
        </div>
        <div class="nameplate"><span id="fig-name">Analyst on duty</span><span class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="true">EN</button><button type="button" data-lang="ko" aria-pressed="false">KO</button></span></div>
        <div class="bubble" id="bubble" aria-live="polite"><span id="bubble-text"></span><span class="caret" aria-hidden="true"></span></div>
        <div class="chips" id="chips"></div>
      </aside>
      <div class="shelf">
%s
%s
%s
%s
      </div>
    </div>
    <p class="room-foot">Design only for now. The private side of this room is <code>Drive/fin-lab/</code>. <a href="../market-board-facade/">Market Board Facade &rarr;</a></p>''' % (
        ticker_items, ticker_items,
        placard('Market commentary', 'Daily and weekly notes on the markets: rates, FX, equities, credit. Filed by date and theme.', 'Space reserved'),
        placard('Analyst reports', 'Sell-side and in-house research, tagged by sector, issuer and author, with the key charts kept alongside.', 'Space reserved'),
        placard('Sources &amp; feeds', 'Where the material comes from and how it is refreshed: uploads, scheduled pulls, and links to be connected.', 'To be connected'),
        placard('Hand-off to the Market Board', 'What the lab extracts for the board outside: series, snapshots and summaries, once the database is established.', 'Planned'))
    return shell('fin-lab', 'Fin Lab', palette, scene(inner, defs), body, extra_scripts='  <script src="assets/figure.js"></script>')


# ====================================================================== LEGAL QUARTER
def legal_quarter():
    rnd = random.Random(5)
    books = []
    cols = ['#5a1f24', '#3b2a1c', '#1f3a2a', '#1b2a44', '#6b3d1a', '#4a1d3a', '#2e2e2e', '#7a2e1f']
    for row in range(3):
        x = 60
        while x < 520:
            w = rnd.randint(14, 30); hh = rnd.randint(88, 118); y = 236 + row * 130 - hh; c = rnd.choice(cols)
            books.append('<rect x="%d" y="%d" width="%d" height="%d" rx="2" fill="%s"/>' % (x, y, w, hh, c))
            books.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#fff" opacity=".07"/>' % (x, y, max(2, w // 4), hh))
            books.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#000" opacity=".22"/>' % (x + w - max(2, w // 4), y, max(2, w // 4), hh))
            books.append('<rect x="%d" y="%d" width="%d" height="3" fill="#d4ac4e" opacity=".85"/><rect x="%d" y="%d" width="%d" height="3" fill="#d4ac4e" opacity=".85"/>' % (x + 3, y + 12, w - 6, x + 3, y + hh - 18, w - 6))
            x += w + 2
    panels = ''.join('<rect x="%d" y="0" width="196" height="620" fill="url(#lq-panel)"/><rect x="%d" y="0" width="196" height="620" filter="url(#wood)" opacity=".9"/>'
                     '<rect x="%d" y="40" width="160" height="240" fill="none" stroke="#7a5230" stroke-width="3"/><rect x="%d" y="43" width="154" height="234" fill="none" stroke="#2a180c" stroke-width="2" opacity=".6"/>'
                     '<rect x="%d" y="320" width="160" height="260" fill="none" stroke="#7a5230" stroke-width="3"/><rect x="%d" y="323" width="154" height="254" fill="none" stroke="#2a180c" stroke-width="2" opacity=".6"/>'
                     % (i * 200, i * 200, i * 200 + 18, i * 200 + 21, i * 200 + 18, i * 200 + 21) for i in range(8))
    defs = '''
      <linearGradient id="lq-panel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#32200f"/><stop offset=".5" stop-color="#5a3a20"/><stop offset="1" stop-color="#32200f"/></linearGradient>
      <linearGradient id="lq-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a180f"/><stop offset="1" stop-color="#120905"/></linearGradient>
      <linearGradient id="lq-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a1e"/><stop offset="1" stop-color="#3a2414"/></linearGradient>
      <radialGradient id="lq-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d9f0a0" stop-opacity=".55"/><stop offset=".45" stop-color="#cfe89a" stop-opacity=".16"/><stop offset="1" stop-color="#cfe89a" stop-opacity="0"/></radialGradient>
      <radialGradient id="lq-warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8b45c" stop-opacity=".28"/><stop offset="1" stop-color="#e8b45c" stop-opacity="0"/></radialGradient>
      <linearGradient id="lq-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5a24"/><stop offset=".5" stop-color="#d9b45c"/><stop offset="1" stop-color="#7a5a24"/></linearGradient>
      <linearGradient id="lq-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6b3f"/><stop offset="1" stop-color="#1c4a2c"/></linearGradient>
'''
    inner = '''    <rect width="1600" height="900" fill="#2a1a10"/>
    %s
    <rect x="0" y="614" width="1600" height="16" fill="url(#lq-brass)" opacity=".55"/>
    <rect x="0" y="630" width="1600" height="270" fill="url(#lq-floor)"/><rect x="0" y="630" width="1600" height="270" filter="url(#wood)" opacity=".6"/>
    <rect x="46" y="96" width="500" height="430" fill="#150c06" opacity=".6" filter="url(#soft12)"/>
    <rect x="40" y="90" width="500" height="430" fill="#1e120a" stroke="#7a5230" stroke-width="6"/>
    %s
    %s
    <rect x="600" y="716" width="900" height="170" rx="8" fill="#000" opacity=".45" filter="url(#soft12)"/>
    <rect x="600" y="720" width="900" height="160" rx="6" fill="#4a1d24" opacity=".85"/><rect x="600" y="720" width="900" height="160" rx="6" filter="url(#fabric)" opacity=".6"/><rect x="620" y="736" width="860" height="128" rx="4" fill="none" stroke="#c9a24a" stroke-opacity=".35" stroke-width="2"/>
    <ellipse cx="1180" cy="480" rx="330" ry="180" fill="url(#lq-lamp)"/>
    <rect x="900" y="470" width="560" height="26" rx="3" fill="url(#lq-desk)"/><rect x="900" y="470" width="560" height="26" filter="url(#wood)" opacity=".7"/><rect x="920" y="496" width="520" height="150" fill="#3a2414"/><rect x="920" y="496" width="520" height="150" filter="url(#wood)" opacity=".5"/>
    <rect x="900" y="470" width="560" height="4" fill="#fff" opacity=".12"/>
    <rect x="1112" y="410" width="10" height="60" fill="url(#lq-brass)"/><path d="M1050,412 q67,-46 134,0 z" fill="url(#lq-shade)"/><path d="M1052,410 q65,-40 130,0" fill="none" stroke="#8fd08a" stroke-width="2" opacity=".5"/><rect x="1088" y="466" width="60" height="8" rx="3" fill="url(#lq-brass)"/>
    <rect x="960" y="440" width="120" height="30" fill="#e9dcc0" transform="rotate(-6 1020 455)"/><rect x="960" y="440" width="120" height="30" fill="#000" opacity=".08" transform="rotate(-6 1020 455) translate(3,3)"/><rect x="1180" y="446" width="140" height="24" fill="#d9c9a8" transform="rotate(4 1250 458)"/>
    <ellipse cx="1120" cy="800" rx="520" ry="120" fill="url(#lq-warm)"/>
    <ellipse cx="1180" cy="660" rx="300" ry="30" fill="#000" opacity=".35" filter="url(#soft12)"/>''' % (panels, ''.join('<rect x="40" y="%d" width="500" height="8" fill="#7a5230"/><rect x="40" y="%d" width="500" height="14" fill="#000" opacity=".35" filter="url(#soft4)"/>' % (240 + r * 130 - 4, 240 + r * 130 + 4) for r in range(3)), ''.join(books))
    palette = '''    :root { --room-bg: #2a1a10; --room-ink: #f1e6d0; --room-ink-2: #d9c9ac; --room-muted: #b59a6c; --room-accent: #c9a24a;
      --room-panel: rgba(24, 14, 8, 0.66); --room-line: rgba(201, 162, 74, 0.35); --room-radius: 4px; --room-text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.65);
      --room-font: Georgia, "Times New Roman", "Noto Serif", serif; --room-display: Georgia, "Times New Roman", serif; }
    .room-head h1 { font-weight: 500; letter-spacing: 0.02em; }
    .room-desc { background: var(--room-panel); border: 1px solid var(--room-line); padding: 12px 16px; border-radius: 6px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .motto { margin: 8px 0 0; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--room-muted); }
    .placard { border-top: 3px solid var(--room-accent); }
    .placard h2 { font-variant: small-caps; letter-spacing: 0.05em; }
    .rule { height: 1px; background: linear-gradient(90deg, transparent, var(--room-accent), transparent); margin: 22px 0 0; opacity: .6; }
'''
    body = '''    <header class="room-head">
      <div><h1>Legal Quarter</h1><p class="motto">Ius est ars boni et aequi</p></div>
      <span class="status">Keyed &middot; chambers reserved</span>
    </header>
    <p class="room-desc">The chambers of the house, panelled in walnut and lit by a green lamp. Knowledge of financial law and the advisory work
      built on it will be kept here: notes, memoranda, statutes and precedents. The shelves are up; the volumes are still to come.</p>
    <div class="rule"></div>
    <div class="shelf">
%s
%s
%s
%s
    </div>
    <p class="room-foot">Design only for now. The private side of this room is <code>Drive/legal-quarter/</code>.</p>''' % (
        placard('Financial law notes', 'Working notes on the regulation of markets, institutions and instruments, arranged by subject.', 'Space reserved'),
        placard('Advisory memoranda', 'Opinions and memos, with the questions asked, the reasoning, and the authorities relied upon.', 'Space reserved'),
        placard('Statutes &amp; precedents', 'The primary sources: acts, rules, decisions, kept with their dates in force.', 'Space reserved'),
        placard('Case files', 'Matters followed over time, with their documents and their outcomes.', 'Space reserved'))
    return shell('legal-quarter', 'Legal Quarter', palette, scene(inner, defs), body)


# ====================================================================== LIBRARY
def library():
    rnd = random.Random(21)
    shelves = []
    cols = ['#7a3b2e', '#4d6b3a', '#2f4a6d', '#8a6d2a', '#5a3d5c', '#3a3a3a', '#a0522d', '#6b4a2a', '#2e6b5a', '#b08a4a', '#9c4a3c', '#3d5a4a']
    for row in range(5):
        yb = 150 + row * 138
        x = 70
        while x < 1530:
            w = rnd.randint(12, 34); hh = rnd.randint(76, 118); c = rnd.choice(cols)
            shelves.append('<rect x="%d" y="%d" width="%d" height="%d" rx="1.5" fill="%s"/>' % (x, yb - hh, w, hh, c))
            shelves.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#fff" opacity=".08"/>' % (x, yb - hh, max(2, w // 4), hh))
            shelves.append('<rect x="%d" y="%d" width="%d" height="%d" fill="#000" opacity=".25"/>' % (x + w - max(2, w // 4), yb - hh, max(2, w // 4), hh))
            if rnd.random() < 0.6:
                shelves.append('<rect x="%d" y="%d" width="%d" height="2" fill="#e8d3a0" opacity=".7"/>' % (x + 2, yb - hh + 10, w - 4))
            x += w + 2
        shelves.append('<rect x="60" y="%d" width="1480" height="12" fill="#5a3a1e"/><rect x="60" y="%d" width="1480" height="12" filter="url(#wood)" opacity=".8"/><rect x="60" y="%d" width="1480" height="18" fill="#000" opacity=".4" filter="url(#soft4)"/>' % (yb, yb, yb + 12))
    defs = '''
      <linearGradient id="lb-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0f07"/><stop offset="1" stop-color="#2b1a0e"/></linearGradient>
      <linearGradient id="lb-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2412"/><stop offset="1" stop-color="#1c1108"/></linearGradient>
      <radialGradient id="lb-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd48a" stop-opacity=".6"/><stop offset=".45" stop-color="#ffcf7a" stop-opacity=".2"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
      <linearGradient id="lb-ladder" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6a4e2a"/><stop offset=".5" stop-color="#a8844c"/><stop offset="1" stop-color="#6a4e2a"/></linearGradient>
      <radialGradient id="lb-globe" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#6c8fb0"/><stop offset=".7" stop-color="#2f5273"/><stop offset="1" stop-color="#16293d"/></radialGradient>
'''
    inner = '''    <rect width="1600" height="900" fill="url(#lb-wall)"/>
    <rect x="50" y="20" width="1500" height="800" fill="#2a1a0e" stroke="#5a3a1e" stroke-width="10"/><rect x="50" y="20" width="1500" height="800" filter="url(#wood)" opacity=".7"/>
    %s
    <rect x="0" y="820" width="1600" height="80" fill="url(#lb-floor)"/><rect x="0" y="820" width="1600" height="80" filter="url(#wood)" opacity=".6"/>
    <g><line x1="1178" y1="40" x2="1228" y2="828" stroke="#000" stroke-opacity=".45" stroke-width="12" filter="url(#soft4)"/>
      <g stroke="url(#lb-ladder)" stroke-width="9" stroke-linecap="round"><line x1="1180" y1="40" x2="1230" y2="820"/><line x1="1250" y1="40" x2="1300" y2="820"/>
      %s</g></g>
    <ellipse cx="560" cy="700" rx="360" ry="170" fill="url(#lb-lamp)"/>
    <ellipse cx="560" cy="836" rx="260" ry="16" fill="#000" opacity=".5" filter="url(#soft12)"/>
    <rect x="330" y="720" width="460" height="18" rx="4" fill="#5a3a1e"/><rect x="330" y="720" width="460" height="18" filter="url(#wood)" opacity=".8"/><rect x="330" y="720" width="460" height="3" fill="#fff" opacity=".12"/>
    <rect x="350" y="738" width="24" height="90" fill="#4a2e16"/><rect x="746" y="738" width="24" height="90" fill="#4a2e16"/>
    <rect x="548" y="640" width="10" height="80" fill="#8a6a3a"/><path d="M500,644 q53,-40 106,0 z" fill="#2e6b5a"/><path d="M502,642 q51,-34 102,0" fill="none" stroke="#8fd0b8" stroke-width="2" opacity=".5"/>
    <rect x="400" y="700" width="90" height="20" fill="#e9dcc0" transform="rotate(-5 445 710)"/><rect x="620" y="704" width="110" height="16" fill="#d9c9a8" transform="rotate(3 675 712)"/>
    <circle cx="960" cy="690" r="34" fill="url(#lb-globe)" stroke="#8a6a3a" stroke-width="3"/><path d="M930,680 q30,-14 60,0 M932,700 q28,12 56,0" fill="none" stroke="#9fb8c2" stroke-width="1.2" opacity=".6"/><rect x="956" y="724" width="8" height="16" fill="#8a6a3a"/><ellipse cx="960" cy="742" rx="18" ry="5" fill="#8a6a3a"/>
    <ellipse cx="800" cy="880" rx="900" ry="90" fill="#000" opacity=".45" filter="url(#soft30)"/>''' % (''.join(shelves), ''.join('<line x1="%d" y1="%d" x2="%d" y2="%d"/>' % (1183 + i * 6.2, 88 + i * 98, 1253 + i * 6.2, 88 + i * 98) for i in range(8)))
    palette = '''    :root { --room-bg: #2b1d12; --room-ink: #f3e9d6; --room-ink-2: #dccbb0; --room-muted: #b8a184; --room-accent: #d2a95a;
      --room-panel: rgba(30, 18, 8, 0.66); --room-line: rgba(210, 169, 90, 0.32); --room-radius: 6px; --room-text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.65);
      --room-font: Georgia, "Times New Roman", "Noto Serif", serif; --room-display: Georgia, "Times New Roman", serif; }
    .room-head h1 { font-weight: 500; }
    .room-desc { background: var(--room-panel); border: 1px solid var(--room-line); padding: 12px 16px; border-radius: 6px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .placard h2::before { content: "\\00a7 "; color: var(--room-accent); }
'''
    body = '''    <header class="room-head">
      <h1>Library</h1>
      <span class="status">Keyed &middot; shelves built, catalogue empty</span>
    </header>
    <p class="room-desc">The study in the west tower: a private library from floor to ceiling, with a ladder for the upper shelves and a lamp on the
      reading table. General knowledge will be gathered here and drawn out again when needed. The shelves are built; the catalogue is empty.</p>
    <div class="shelf">
%s
%s
%s
%s
    </div>
    <p class="room-foot">Design only for now. The private side of this room is <code>Drive/library/</code>.</p>''' % (
        placard('General knowledge', 'Notes across subjects, kept in a form that can be found again: topic, source, date, a few lines of summary.', 'Space reserved'),
        placard('Reading notes', 'Books and long pieces, with what was worth keeping from each.', 'Space reserved'),
        placard('Retrieval', 'A way to search the shelves by subject and word, so that what was filed can be taken down quickly.', 'Planned'),
        placard('Catalogue', 'The index of everything on the shelves, by subject and by date added.', 'Space reserved'))
    return shell('library', 'Library', palette, scene(inner, defs), body)


# ====================================================================== MAIDEN HALL
def maiden_hall():
    panels = ''.join('<rect x="%d" y="120" width="190" height="300" fill="none" stroke="#cfc6b5" stroke-width="3"/><rect x="%d" y="123" width="184" height="294" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>'
                     '<rect x="%d" y="450" width="190" height="120" fill="none" stroke="#cfc6b5" stroke-width="3"/><rect x="%d" y="453" width="184" height="114" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>'
                     % (80 + i * 250, 83 + i * 250, 80 + i * 250, 83 + i * 250) for i in range(6))
    chandelier = ('<line x1="800" y1="0" x2="800" y2="110" stroke="#b8a06a" stroke-width="3"/>' +
                  ''.join('<path d="M800,110 q%d,30 %d,70" fill="none" stroke="#c9b27a" stroke-width="3"/><ellipse cx="%d" cy="184" rx="8" ry="14" fill="#fff4d6"/><circle cx="%d" cy="176" r="26" fill="#fff4d6" opacity=".35" filter="url(#soft12)"/>'
                          % (dx, int(dx * 1.4), 800 + int(dx * 1.4), 800 + int(dx * 1.4)) for dx in (-60, -30, 30, 60)) +
                  '<circle cx="800" cy="120" r="12" fill="#c9b27a"/><circle cx="800" cy="180" r="60" fill="#fff4d6" opacity=".2" filter="url(#soft30)"/>')
    defs = '''
      <linearGradient id="mh-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efebe1"/><stop offset="1" stop-color="#dfd9cb"/></linearGradient>
      <linearGradient id="mh-window" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfaf4"/><stop offset="1" stop-color="#dbe8ec"/></linearGradient>
      <linearGradient id="mh-floor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9975f"/><stop offset=".5" stop-color="#d4b88a"/><stop offset="1" stop-color="#b9975f"/></linearGradient>
      <linearGradient id="mh-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".6"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <linearGradient id="mh-sofa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa6bd"/><stop offset="1" stop-color="#5f7e96"/></linearGradient>
      <pattern id="parquet" width="60" height="30" patternUnits="userSpaceOnUse" patternTransform="skewX(-20)"><rect width="30" height="30" fill="#000" opacity=".06"/><rect x="30" width="30" height="30" fill="#fff" opacity=".05"/></pattern>
'''
    inner = '''    <rect width="1600" height="900" fill="url(#mh-wall)"/><rect width="1600" height="900" filter="url(#plaster)" opacity=".7"/>
    <rect x="0" y="0" width="1600" height="60" fill="#e8e3d7"/><rect x="0" y="56" width="1600" height="6" fill="#cfc6b5"/><rect x="0" y="62" width="1600" height="8" fill="#000" opacity=".06"/>
    %s
    <g><rect x="360" y="90" width="200" height="440" fill="url(#mh-window)" stroke="#d9d2c2" stroke-width="10"/><path d="M460,90 V530 M360,310 H560" stroke="#d9d2c2" stroke-width="8"/><rect x="370" y="100" width="180" height="200" fill="#fff" opacity=".35"/>
      <rect x="1040" y="90" width="200" height="440" fill="url(#mh-window)" stroke="#d9d2c2" stroke-width="10"/><path d="M1140,90 V530 M1040,310 H1240" stroke="#d9d2c2" stroke-width="8"/><rect x="1050" y="100" width="180" height="200" fill="#fff" opacity=".35"/></g>
    <g filter="url(#fabric)" opacity=".9"><path d="M330,80 q30,220 0,470 h60 q-40,-250 0,-470 z" fill="#f6f3ea"/><path d="M560,80 q-30,220 0,470 h60 q40,-250 0,-470 z" fill="#f6f3ea"/>
      <path d="M1010,80 q30,220 0,470 h60 q-40,-250 0,-470 z" fill="#f6f3ea"/><path d="M1240,80 q-30,220 0,470 h60 q40,-250 0,-470 z" fill="#f6f3ea"/></g>
    %s
    <rect x="0" y="580" width="1600" height="14" fill="#cfc6b5"/><rect x="0" y="594" width="1600" height="306" fill="url(#mh-floor)"/><rect x="0" y="594" width="1600" height="306" fill="url(#parquet)"/><rect x="0" y="594" width="1600" height="306" filter="url(#wood)" opacity=".35"/>
    <polygon points="360,594 560,594 700,900 220,900" fill="url(#mh-light)"/><polygon points="1040,594 1240,594 1380,900 900,900" fill="url(#mh-light)"/>
    <ellipse cx="800" cy="800" rx="260" ry="36" fill="#000" opacity=".25" filter="url(#soft12)"/>
    <rect x="620" y="640" width="360" height="150" rx="16" fill="url(#mh-sofa)"/><rect x="620" y="640" width="360" height="150" rx="16" filter="url(#fabric)" opacity=".5"/><rect x="600" y="620" width="400" height="60" rx="30" fill="#8fabc2"/><rect x="600" y="620" width="400" height="60" rx="30" filter="url(#fabric)" opacity=".5"/><rect x="600" y="760" width="400" height="20" rx="6" fill="#4f6b82"/>
    <rect x="1290" y="600" width="220" height="16" rx="3" fill="#8a6a3a"/><rect x="1290" y="600" width="220" height="16" filter="url(#wood)" opacity=".8"/><rect x="1300" y="616" width="16" height="120" fill="#7a5c30"/><rect x="1484" y="616" width="16" height="120" fill="#7a5c30"/>
    <rect x="1330" y="560" width="80" height="40" fill="#f2ecdd" transform="rotate(-8 1370 580)"/><rect x="1440" y="574" width="10" height="26" fill="#2b2b2b"/>
    <ellipse cx="800" cy="850" rx="460" ry="60" fill="#b9c8d2" opacity=".55"/><ellipse cx="800" cy="850" rx="460" ry="60" filter="url(#fabric)" opacity=".4"/>''' % (panels, chandelier)
    palette = '''    :root { --room-bg: #ece7dd; --room-ink: #2f2a24; --room-ink-2: #524a40; --room-muted: #7a7060; --room-accent: #6f8fa8;
      --room-panel: rgba(255, 255, 255, 0.72); --room-line: rgba(111, 143, 168, 0.35); --room-radius: 10px;
      --room-font: Georgia, "Times New Roman", "Noto Serif", serif; --room-display: Georgia, "Times New Roman", serif; }
    .crumbs a { color: var(--room-ink-2); }
    .room-head h1 { font-weight: 500; letter-spacing: 0.01em; }
    .placard { box-shadow: 0 6px 24px rgba(60, 50, 30, 0.08); }
    .placard h2 { color: #3e5a72; }
'''
    body = '''    <header class="room-head">
      <h1>Maiden Hall</h1>
      <span class="status">Keyed &middot; the writing desk is set</span>
    </header>
    <p class="room-desc">The drawing room over the front door, in pale blue and cream, with tall windows onto the lake. Here reports are framed,
      addresses are drafted, and the papers that support the day's work are kept within reach. The desk is set; the tools come later.</p>
    <div class="shelf">
%s
%s
%s
%s
    </div>
    <p class="room-foot">Design only for now. The private side of this room is <code>Drive/maiden-hall/</code>.</p>''' % (
        placard('Report scaffolds', 'Outlines and templates for the reports written most often: structure first, then the filling in.', 'Space reserved'),
        placard('Speech drafts', 'Remarks and addresses, from first notes to the delivered text, with what worked kept for next time.', 'Space reserved'),
        placard('Work materials', 'Papers directly tied to current work, filed by matter and date.', 'Space reserved'),
        placard('Support tools', 'Helpers for the work itself: checklists, phrase banks, formats. To be developed.', 'Planned'))
    return shell('maiden-hall', 'Maiden Hall', palette, scene(inner, defs), body)


# ====================================================================== GARDEN
def garden():
    rnd = random.Random(31)
    flowers = ''.join('<circle cx="%d" cy="%d" r="%s" fill="#1e3a1a" opacity=".35"/><circle cx="%d" cy="%d" r="%s" fill="%s"/>' % (x, y + 2, r, x, y, r, c)
                      for (x, y, r, c) in [(rnd.randint(80, 1520), rnd.randint(640, 880), rnd.choice([3, 4, 5]), rnd.choice(["#e18ba7", "#f1d16b", "#f6f3ea", "#d9645e", "#b48ad6"])) for _ in range(110)])
    hedges = ''.join('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#1c3a1c" opacity=".4" filter="url(#soft12)"/><ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s"/><ellipse cx="%d" cy="%d" rx="%d" ry="%d" filter="url(#grass)" opacity=".7"/><ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#8fc76a" opacity=".35"/>'
                     % (x + 10, y + 14, rx, ry, x, y, rx, ry, c, x, y, rx, ry, x - rx * .3, y - ry * .4, rx * .5, ry * .35)
                     for (x, y, rx, ry, c) in [(140, 600, 150, 70, '#3f7a3d'), (1460, 590, 160, 75, '#41803f'), (300, 520, 90, 50, '#4b8a45'), (1300, 520, 100, 55, '#4b8a45')])
    lilies = ''.join('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#5c9a4e"/><circle cx="%d" cy="%d" r="3" fill="#f6b6c8"/>' % (x, y, r, int(r * .6), x + int(r * .4), y - int(r * .3)) for (x, y, r) in [(700, 790, 14), (760, 810, 11), (840, 795, 13), (900, 815, 10)])
    defs = '''
      <linearGradient id="gd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb0e8"/><stop offset=".6" stop-color="#cfe4f2"/><stop offset="1" stop-color="#f1efd8"/></linearGradient>
      <linearGradient id="gd-lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb25e"/><stop offset="1" stop-color="#4f8a43"/></linearGradient>
      <linearGradient id="gd-pond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe7f3"/><stop offset="1" stop-color="#4f8bb0"/></linearGradient>
      <radialGradient id="gd-sun" cx="1300" cy="140" r="260" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe6"/><stop offset=".35" stop-color="#fff3c0" stop-opacity=".7"/><stop offset="1" stop-color="#fff3c0" stop-opacity="0"/></radialGradient>
      <linearGradient id="gd-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93b87e"/><stop offset="1" stop-color="#7fb25e"/></linearGradient>
      <linearGradient id="gd-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
'''
    inner = '''    <rect width="1600" height="900" fill="url(#gd-sky)"/><rect width="1600" height="900" fill="url(#gd-sun)"/>
    <rect x="-100" y="0" width="1800" height="420" filter="url(#clouds)" opacity=".9"/>
    <path d="M0,470 C300,400 500,460 800,430 C1100,400 1300,450 1600,420 L1600,572 L0,572 Z" fill="url(#gd-far)"/>
    <rect x="0" y="560" width="1600" height="340" fill="url(#gd-lawn)"/><rect x="0" y="400" width="1600" height="500" filter="url(#grass)" opacity=".8"/>
    <rect x="0" y="400" width="1600" height="170" fill="url(#gd-haze)"/>
    %s
    <path d="M700,900 C720,760 880,760 900,900 Z" fill="#d9c9a0"/><path d="M700,900 C720,760 880,760 900,900 Z" filter="url(#plaster)" opacity=".8"/>
    <ellipse cx="800" cy="812" rx="210" ry="66" fill="#3a5a3a" opacity=".35" filter="url(#soft12)"/>
    <ellipse cx="800" cy="800" rx="200" ry="60" fill="#9fb9a0"/><ellipse cx="800" cy="796" rx="180" ry="50" fill="url(#gd-pond)"/><ellipse cx="770" cy="780" rx="80" ry="14" fill="#fff" opacity=".35" filter="url(#soft4)"/>
    %s
    <ellipse cx="1170" cy="760" rx="120" ry="14" fill="#1e3a1a" opacity=".35" filter="url(#soft4)"/>
    <rect x="1080" y="700" width="180" height="14" rx="4" fill="#6b4a2a"/><rect x="1080" y="700" width="180" height="14" filter="url(#wood)" opacity=".8"/><rect x="1090" y="714" width="12" height="40" fill="#5a3a1e"/><rect x="1238" y="714" width="12" height="40" fill="#5a3a1e"/><rect x="1080" y="672" width="180" height="10" rx="4" fill="#6b4a2a"/><rect x="1080" y="686" width="180" height="8" rx="4" fill="#6b4a2a"/>
    %s
    <g class="butterfly" fill="#f0b64a"><path d="M0,0 q-14,-16 -16,0 q2,14 16,0 z"/><path d="M0,0 q14,-16 16,0 q-2,14 -16,0 z"/></g>
    <g class="butterfly b2" fill="#7ea8e6"><path d="M0,0 q-12,-14 -14,0 q2,12 14,0 z"/><path d="M0,0 q12,-14 14,0 q-2,12 -14,0 z"/></g>''' % (hedges, lilies, flowers)
    palette = '''    :root { --room-bg: #dfeccb; --room-ink: #24331c; --room-ink-2: #3e5232; --room-muted: #5d6f4a; --room-accent: #d9645e;
      --room-panel: rgba(255, 255, 255, 0.62); --room-line: rgba(60, 90, 40, 0.25); --room-radius: 16px; }
    .crumbs a { color: var(--room-ink-2); }
    .room-head h1 { font-weight: 600; }
    .butterfly { animation: flutter 14s ease-in-out infinite; transform-origin: center; }
    .butterfly.b2 { animation-duration: 19s; animation-delay: -6s; }
    @keyframes flutter { 0% { transform: translate(400px, 520px); } 25% { transform: translate(700px, 600px) rotate(10deg); } 50% { transform: translate(1000px, 500px); } 75% { transform: translate(600px, 680px) rotate(-8deg); } 100% { transform: translate(400px, 520px); } }
    @media (prefers-reduced-motion: reduce) { .butterfly { animation: none; transform: translate(500px, 560px); } }
'''
    body = '''    <header class="room-head">
      <h1>Garden</h1>
      <span class="status">Keyed &middot; in bloom</span>
    </header>
    <p class="room-desc">The grounds outside the walls: a lawn, a pond with lilies, a bench under the hedge. This is where lighter things will go,
      for leisure rather than work. Nothing needs doing here yet.</p>
    <div class="shelf">
%s
%s
%s
    </div>
    <p class="room-foot">Design only. The private side of this room is <code>Drive/garden/</code>.</p>''' % (
        placard('Leisure', 'Things enjoyed for their own sake.', 'Later'),
        placard('Light reading', 'Pieces that ask nothing of the reader.', 'Later'),
        placard('Walks', 'Places, routes, seasons.', 'Later'))
    return shell('garden', 'Garden', palette, scene(inner, defs), body)


# ====================================================================== BEDROOM
def bedroom():
    defs = '''
      <linearGradient id="bd-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1813"/><stop offset="1" stop-color="#170d0a"/></linearGradient>
      <linearGradient id="bd-curtain" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3e1218"/><stop offset=".3" stop-color="#7a2a36"/><stop offset=".5" stop-color="#4e171e"/><stop offset=".75" stop-color="#8a3040"/><stop offset="1" stop-color="#3e1218"/></linearGradient>
      <linearGradient id="bd-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2216"/><stop offset="1" stop-color="#1a0f0b"/></linearGradient>
      <linearGradient id="bd-moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a5c"/><stop offset="1" stop-color="#1a2440"/></linearGradient>
      <linearGradient id="bd-linen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ecdb"/><stop offset="1" stop-color="#d9c8ae"/></linearGradient>
      <linearGradient id="bd-throw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f3540"/><stop offset="1" stop-color="#5b1a24"/></linearGradient>
      <linearGradient id="bd-head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3b32"/><stop offset="1" stop-color="#3a2621"/></linearGradient>
      <radialGradient id="bd-lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc07a" stop-opacity=".85"/><stop offset=".35" stop-color="#ff9d4a" stop-opacity=".3"/><stop offset="1" stop-color="#ff9d4a" stop-opacity="0"/></radialGradient>
      <linearGradient id="bd-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe4b8"/><stop offset="1" stop-color="#e2b27a"/></linearGradient>
'''
    inner = '''    <rect width="1600" height="900" fill="url(#bd-wall)"/><rect width="1600" height="900" filter="url(#plaster)" opacity=".5"/>
    <rect x="1240" y="100" width="220" height="360" fill="url(#bd-moon)" stroke="#3a2a22" stroke-width="10"/><circle cx="1380" cy="190" r="34" fill="#e9e2c8"/><circle cx="1380" cy="190" r="60" fill="#e9e2c8" opacity=".2" filter="url(#soft12)"/><path d="M1350,100 V460 M1240,280 H1460" stroke="#3a2a22" stroke-width="8"/>
    <polygon points="1240,460 1460,460 1560,900 1140,900" fill="#9fb4e6" opacity=".08"/>
    <rect x="0" y="600" width="1600" height="300" fill="url(#bd-floor)"/><rect x="0" y="600" width="1600" height="300" filter="url(#wood)" opacity=".55"/>
    <rect x="200" y="640" width="1100" height="200" rx="12" fill="#5a2a2a" opacity=".55"/><rect x="200" y="640" width="1100" height="200" rx="12" filter="url(#fabric)" opacity=".5"/><rect x="230" y="670" width="1040" height="140" rx="8" fill="none" stroke="#c9a24a" stroke-opacity=".25" stroke-width="3"/>
    <rect x="360" y="80" width="880" height="26" rx="6" fill="#7a5a2a"/><rect x="360" y="80" width="880" height="26" filter="url(#wood)" opacity=".8"/>
    <g><path d="M370,106 q-60,220 -20,520 h90 q-40,-300 10,-520 z" fill="url(#bd-curtain)"/><path d="M370,106 q-60,220 -20,520 h90 q-40,-300 10,-520 z" filter="url(#fabric)" opacity=".7"/>
      <path d="M1230,106 q60,220 20,520 h-90 q40,-300 -10,-520 z" fill="url(#bd-curtain)"/><path d="M1230,106 q60,220 20,520 h-90 q40,-300 -10,-520 z" filter="url(#fabric)" opacity=".7"/></g>
    <rect x="480" y="300" width="640" height="150" rx="20" fill="url(#bd-head)"/><rect x="480" y="300" width="640" height="150" rx="20" filter="url(#fabric)" opacity=".5"/><rect x="500" y="320" width="600" height="110" rx="14" fill="#6a453a"/>
    <path d="M500,320 h600 M500,375 h600 M650,320 v110 M800,320 v110 M950,320 v110" stroke="#3a2621" stroke-width="3" opacity=".7"/>
    <rect x="470" y="450" width="660" height="230" rx="14" fill="url(#bd-linen)"/><rect x="470" y="450" width="660" height="230" rx="14" filter="url(#fabric)" opacity=".4"/>
    <rect x="470" y="520" width="660" height="160" rx="14" fill="url(#bd-throw)"/><rect x="470" y="520" width="660" height="160" rx="14" filter="url(#fabric)" opacity=".6"/><rect x="470" y="600" width="660" height="80" rx="10" fill="#8f3540" opacity=".85"/>
    <rect x="520" y="455" width="230" height="60" rx="22" fill="#fbf4e6"/><rect x="850" y="455" width="230" height="60" rx="22" fill="#fbf4e6"/><rect x="520" y="500" width="230" height="15" rx="7" fill="#000" opacity=".12"/><rect x="850" y="500" width="230" height="15" rx="7" fill="#000" opacity=".12"/>
    <ellipse cx="800" cy="690" rx="360" ry="20" fill="#000" opacity=".45" filter="url(#soft12)"/>
    <g class="lamp lamp-l"><circle cx="330" cy="470" r="170" fill="url(#bd-lamp)"/><path d="M290,470 h80 l-12,-60 h-56 z" fill="url(#bd-shade)"/><rect x="326" y="470" width="8" height="60" fill="#8a6a3a"/><ellipse cx="330" cy="530" rx="22" ry="6" fill="#8a6a3a"/></g>
    <g class="lamp lamp-r"><circle cx="1270" cy="470" r="170" fill="url(#bd-lamp)"/><path d="M1230,470 h80 l-12,-60 h-56 z" fill="url(#bd-shade)"/><rect x="1266" y="470" width="8" height="60" fill="#8a6a3a"/><ellipse cx="1270" cy="530" rx="22" ry="6" fill="#8a6a3a"/></g>
    <rect x="270" y="530" width="120" height="80" rx="6" fill="#4a2e1c"/><rect x="270" y="530" width="120" height="80" rx="6" filter="url(#wood)" opacity=".8"/><rect x="1210" y="530" width="120" height="80" rx="6" fill="#4a2e1c"/><rect x="1210" y="530" width="120" height="80" rx="6" filter="url(#wood)" opacity=".8"/>
    <ellipse cx="800" cy="890" rx="900" ry="90" fill="#000" opacity=".5" filter="url(#soft30)"/>'''
    palette = '''    :root { --room-bg: #1f1310; --room-ink: #f5e6d3; --room-ink-2: #dcc4ad; --room-muted: #b9957d; --room-accent: #e0a35a;
      --room-panel: rgba(40, 20, 14, 0.6); --room-line: rgba(224, 163, 90, 0.3); --room-radius: 12px; --room-text-shadow: 0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.65);
      --room-font: Georgia, "Times New Roman", "Noto Serif", serif; --room-display: Georgia, "Times New Roman", serif; }
    .room-head h1 { font-weight: 500; font-style: italic; }
    .lamp { transform-box: fill-box; transform-origin: center; animation: glow 3.6s ease-in-out infinite alternate; }
    .lamp-r { animation-delay: -1.8s; }
    @keyframes glow { from { opacity: .82; } to { opacity: 1; } }
    body.dim .lamp circle { opacity: .35; } body.dim .scene-wrap { filter: brightness(.7); }
    .lights { margin-top: 20px; font: inherit; font-size: 13px; color: var(--room-ink); background: var(--room-panel); border: 1px solid var(--room-line); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
    @media (prefers-reduced-motion: reduce) { .lamp { animation: none; } }
'''
    body = '''    <header class="room-head">
      <h1>Bedroom</h1>
      <span class="status">Keyed &middot; lamps lit</span>
    </header>
    <p class="room-desc">The private quarters in the east tower, under warm lamplight: a canopy bed in burgundy and cream, curtains drawn against the lake,
      a moon in the window. Nothing to do here but rest.</p>
    <button class="lights" type="button" id="lights" aria-pressed="false">Dim the lamps</button>
    <div class="shelf">
%s
    </div>
    <p class="room-foot">The private side of this room is <code>Drive/bedroom/</code>.</p>''' % placard('Rest', 'Design only. This room is kept as it is.', 'Nothing planned')
    scripts = '''  <script>
    (function () {
      var b = document.getElementById('lights');
      b.addEventListener('click', function () {
        var dim = document.body.classList.toggle('dim');
        b.setAttribute('aria-pressed', String(dim));
        b.textContent = dim ? 'Light the lamps' : 'Dim the lamps';
      });
    })();
  </script>'''
    return shell('bedroom', 'Bedroom', palette, scene(inner, defs), body, extra_scripts=scripts)


PAGES = {'fin-lab': fin_lab, 'legal-quarter': legal_quarter, 'library': library, 'maiden-hall': maiden_hall, 'garden': garden, 'bedroom': bedroom}
if __name__ == '__main__':
    for folder, fn in PAGES.items():
        out = ROOT / folder / 'index.html'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(fn())
        print('wrote', out.relative_to(ROOT), out.stat().st_size // 1024, 'KB')
    css = ROOT / 'assets' / 'rooms.css'
    text = css.read_text()
    if '.scene-wrap' not in text:
        text = text.replace('.scene { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; display: block; }',
            '.scene-wrap { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: var(--room-bg); }\n'
            '.scene-wrap > .scene, .scene-wrap > .scene-photo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }\n'
            '.scene-wrap::after { content: ""; position: absolute; inset: 0; pointer-events: none;\n'
            '  background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%), url("' + NOISE.replace('#', '%23') + '");\n'
            '  mix-blend-mode: multiply; opacity: 0.9; }')
        css.write_text(text)
        print('rooms.css: scene-wrap added')
