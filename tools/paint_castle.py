#!/usr/bin/env python3
"""Paints assets/castle-painting.svg: the house on the lake, the drawn fallback used
when assets/img/castle.jpg is absent.  Run from the repository root:

    python3 tools/paint_castle.py

The hotspots are NOT part of this file; they are drawn as an overlay by
assets/castle.js from the boxes in assets/rooms.js (1600 x 900 grid)."""
import random
from pathlib import Path

random.seed(7)
W, H = 1600, 900
P = []
add = P.append

# ------------------------------------------------------------------ defs
add('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4f6b"/><stop offset=".38" stop-color="#8ea0b6"/><stop offset=".62" stop-color="#c9c4b6"/><stop offset=".8" stop-color="#e9cf9f"/><stop offset="1" stop-color="#f3dcae"/></linearGradient>
<radialGradient id="sun" cx="1430" cy="520" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6d8" stop-opacity="1"/><stop offset=".3" stop-color="#fbe4ad" stop-opacity=".7"/><stop offset=".7" stop-color="#f7d99a" stop-opacity=".18"/><stop offset="1" stop-color="#f7d99a" stop-opacity="0"/></radialGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6dcc6" stop-opacity="0"/><stop offset="1" stop-color="#e6dcc6" stop-opacity=".75"/></linearGradient>
<linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aab68"/><stop offset=".35" stop-color="#6f8d4b"/><stop offset="1" stop-color="#2f4529"/></linearGradient>
<linearGradient id="lawn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f7d45"/><stop offset=".5" stop-color="#7f9a55"/><stop offset="1" stop-color="#9aab68"/></linearGradient>
<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dcd6"/><stop offset=".5" stop-color="#8fa1a8"/><stop offset="1" stop-color="#4f6169"/></linearGradient>
<linearGradient id="lakeSheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".55" stop-color="#fff2cf" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="reflFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="reflMask"><rect x="0" y="656" width="1600" height="300" fill="url(#reflFade)"/></mask>
<linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a08d6c"/><stop offset=".45" stop-color="#cfbd98"/><stop offset="1" stop-color="#e8d8b4"/></linearGradient>
<linearGradient id="stoneShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c7a5b"/><stop offset=".5" stop-color="#b8a681"/><stop offset="1" stop-color="#d7c6a2"/></linearGradient>
<radialGradient id="towerShade" cx=".62" cy=".5" r=".75"><stop offset="0" stop-color="#e2d2ae"/><stop offset=".6" stop-color="#bfae8a"/><stop offset="1" stop-color="#7f6d4f"/></radialGradient>
<linearGradient id="slate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a8593"/><stop offset=".6" stop-color="#525c69"/><stop offset="1" stop-color="#3c4550"/></linearGradient>
<radialGradient id="cone" cx=".6" cy=".3" r=".8"><stop offset="0" stop-color="#7f8a98"/><stop offset=".7" stop-color="#4d5764"/><stop offset="1" stop-color="#2f3740"/></radialGradient>
<linearGradient id="glassLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0be"/><stop offset=".55" stop-color="#f0bd62"/><stop offset="1" stop-color="#b3722c"/></linearGradient>
<linearGradient id="glassDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c9bab"/><stop offset=".45" stop-color="#3f4a58"/><stop offset="1" stop-color="#22282f"/></linearGradient>
<radialGradient id="hall" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#ffe4a6"/><stop offset=".5" stop-color="#c17f36"/><stop offset="1" stop-color="#2d1c10"/></radialGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98c" stop-opacity=".6"/><stop offset="1" stop-color="#ffd98c" stop-opacity="0"/></radialGradient>
<linearGradient id="trunk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1d12"/><stop offset=".5" stop-color="#4b3622"/><stop offset="1" stop-color="#241810"/></linearGradient>
<linearGradient id="hedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f8f4a"/><stop offset="1" stop-color="#2d4d2b"/></linearGradient>
<linearGradient id="light" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a3550" stop-opacity=".28"/><stop offset=".5" stop-color="#2a3550" stop-opacity="0"/><stop offset="1" stop-color="#ffd58a" stop-opacity=".18"/></linearGradient>
<radialGradient id="vignette" cx=".5" cy=".45" r=".75"><stop offset=".5" stop-color="#1e150c" stop-opacity="0"/><stop offset="1" stop-color="#1e150c" stop-opacity=".55"/></radialGradient>
<pattern id="courses" width="52" height="18" patternUnits="userSpaceOnUse"><path d="M0,17.5 H52 M26,0 V17.5" stroke="#3b2e1e" stroke-opacity=".16" stroke-width="1" fill="none"/></pattern>
<pattern id="coursesB" width="52" height="18" patternUnits="userSpaceOnUse" patternTransform="translate(26,9)"><path d="M0,17.5 H52 M26,0 V17.5" stroke="#3b2e1e" stroke-opacity=".16" stroke-width="1" fill="none"/></pattern>
<pattern id="slates" width="14" height="7" patternUnits="userSpaceOnUse"><path d="M0,6.5 H14 M7,0 V6.5" stroke="#1f252c" stroke-opacity=".35" stroke-width=".8" fill="none"/></pattern>
<pattern id="gravel" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#8f7f5c" opacity=".5"/><circle cx="5" cy="4" r=".7" fill="#b9a982" opacity=".5"/></pattern>
<filter id="clouds" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".0032 .009" numOctaves="5" seed="11" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .99  0 0 0 0 .96  0 0 0 0 .9  0 0 0 10 -5.5"/><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="cirrus" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".0025 .016" numOctaves="4" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 .98  0 0 0 0 .94  0 0 0 7 -3.9"/><feGaussianBlur stdDeviation="3"/></filter>
<filter id="stoneTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 .28"/></feComponentTransfer></filter>
<filter id="grassTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".08 .5" numOctaves="4" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 .22  0 0 0 0 .34  0 0 0 0 .13  0 0 0 .5 -.16"/></filter>
<filter id="brush" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="leaf" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="22" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="ripple" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".02 .16" numOctaves="2" seed="8"/><feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="soft6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 .26"/></feComponentTransfer></filter>
<clipPath id="houseClip"><polygon points="286,302 394,302 340,206"/><rect x="300" y="300" width="80" height="336"/><polygon points="1206,302 1314,302 1260,206"/><rect x="1220" y="300" width="80" height="336"/><polygon points="368,424 592,424 572,372 388,372"/><rect x="380" y="420" width="200" height="216"/><polygon points="1008,424 1232,424 1212,372 1028,372"/><rect x="1020" y="420" width="200" height="216"/><polygon points="568,394 1032,394 1006,326 594,326"/><rect x="580" y="390" width="440" height="246"/><polygon points="704,354 896,354 800,290"/><rect x="720" y="350" width="160" height="286"/><rect x="778" y="214" width="44" height="82"/></clipPath>
<clipPath id="lakeClip"><path id="lakeShape" d="M0,700 C120,676 300,668 470,684 C600,696 700,720 740,776 C770,820 740,868 660,900 L0,900 Z"/></clipPath>
</defs>
<style>
.clouds{animation:drift 240s linear infinite alternate}@keyframes drift{to{transform:translateX(-90px)}}
.cirrus{animation:drift2 300s linear infinite alternate}@keyframes drift2{to{transform:translateX(70px)}}
.birds{animation:fly 150s linear infinite alternate}@keyframes fly{to{transform:translate(-260px,-50px)}}
.smoke circle{animation:rise 7s ease-out infinite}.smoke .p1{animation-delay:-2.3s}.smoke .p2{animation-delay:-4.6s}@keyframes rise{0%{transform:translate(0,0);opacity:.5}100%{transform:translate(22px,-80px);opacity:0}}
.jet{animation:spout 2.6s ease-in-out infinite alternate;transform-origin:1275px 756px}@keyframes spout{to{transform:scaleY(1.2)}}
.glint line{animation:glint 3.4s ease-in-out infinite alternate}.glint line:nth-child(2n){animation-delay:-1.7s}@keyframes glint{to{opacity:.1}}
.lit{animation:flicker 6s ease-in-out infinite alternate}@keyframes flicker{to{opacity:.82}}
@media (prefers-reduced-motion:reduce){.clouds,.cirrus,.birds,.smoke circle,.jet,.glint line,.lit{animation:none}}
</style>''')

# ------------------------------------------------------------------ sky
add('<rect width="1600" height="900" fill="url(#sky)"/>')
add('<rect width="1600" height="900" fill="url(#sun)"/>')
add('<g class="cirrus"><rect x="-100" y="-200" width="1800" height="560" filter="url(#cirrus)" opacity=".45"/></g>')
add('<g class="clouds"><rect x="-120" y="-240" width="1840" height="700" filter="url(#clouds)" opacity=".9"/></g>')
add('<circle cx="1430" cy="506" r="38" fill="#fff8e0" filter="url(#soft6)"/><circle cx="1430" cy="506" r="120" fill="#ffe9b0" opacity=".35" filter="url(#soft)"/>')

# ------------------------------------------------------------------ mountains
add('<g filter="url(#brush)">')
add('<path d="M0,585 L90,540 L170,556 L260,505 L360,540 L440,470 L520,520 L600,486 L700,540 L800,470 L900,528 L1000,480 L1090,520 L1180,468 L1290,512 L1380,478 L1470,522 L1600,500 L1600,680 L0,680 Z" fill="#8f9fb5" opacity=".72"/>')
add('<path d="M0,608 L120,584 L220,600 L330,566 L450,590 L560,556 L680,596 L790,574 L900,600 L1010,562 L1130,596 L1240,570 L1360,600 L1480,578 L1600,596 L1600,700 L0,700 Z" fill="#7a8f8d" opacity=".78"/>')
add('<path d="M0,630 C150,606 300,622 470,614 C640,606 800,596 980,612 C1160,628 1330,604 1600,616 L1600,720 L0,720 Z" fill="#617f66" opacity=".9"/>')
add('</g>')
add('<rect x="0" y="520" width="1600" height="130" fill="url(#haze)"/>')

# ------------------------------------------------------------------ ground
add('<rect x="0" y="606" width="1600" height="300" fill="url(#meadow)"/>')
add('<rect x="0" y="606" width="1600" height="300" filter="url(#grassTex)" opacity=".7"/>')
for i in range(70):
    x = random.randint(0, 1600); y = random.randint(650, 890); w = random.randint(50, 180)
    add(f'<path d="M{x},{y} q{w//2},-5 {w},0" stroke="#3f5a33" stroke-opacity=".28" stroke-width="{random.choice([2,3,4])}" fill="none"/>')
add('<ellipse cx="800" cy="700" rx="700" ry="80" fill="#a8b56e" opacity=".22" filter="url(#soft)"/>')

# ------------------------------------------------------------------ the house (as a reusable group for the reflection)
def roof(x1, x2, yb, yt, inset):
    return (f'<polygon points="{x1},{yb} {x2},{yb} {x2-inset},{yt} {x1+inset},{yt}" fill="url(#slate)"/>'
            f'<polygon points="{x1},{yb} {x2},{yb} {x2-inset},{yt} {x1+inset},{yt}" fill="url(#slates)"/>'
            f'<line x1="{x1+inset}" y1="{yt+1}" x2="{x2-inset}" y2="{yt+1}" stroke="#9aa5b2" stroke-width="2"/>')
def wall(x, y, w, hh, g='stone', pat='courses'):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" fill="url(#{g})"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" fill="url(#{pat})"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" filter="url(#stoneTex)" opacity=".8"/>')
def cornice(x, w, y):
    return (f'<rect x="{x-4}" y="{y-9}" width="{w+8}" height="9" fill="#dccbaa"/>'
            f'<rect x="{x-4}" y="{y}" width="{w+8}" height="4" fill="#5a4a34" opacity=".55"/>')
def quoins(x, y, hh, right=False):
    s = ''
    for i in range(int(hh // 16)):
        wdt = 16 if i % 2 == 0 else 11
        xx = x - (wdt if right else 0)
        s += f'<rect x="{xx}" y="{y+i*16}" width="{wdt}" height="15" fill="#e9dcbd" stroke="#8d7a58" stroke-width=".6"/>'
    return s
def win(x, y, w=26, hh=52, lit=True, arch=False):
    fill = 'url(#glassLit)' if lit else 'url(#glassDark)'
    r = w / 2
    s = ''
    if lit:
        s += f'<rect x="{x-14}" y="{y-14}" width="{w+28}" height="{hh+28}" fill="url(#glow)" class="lit"/>'
    if arch:
        s += f'<path d="M{x-3},{y+hh} V{y+r} A{r+3},{r+3} 0 0 1 {x+w+3},{y+r} V{y+hh} Z" fill="#7d6b4c"/>'
        s += f'<path d="M{x},{y+hh} V{y+r} A{r},{r} 0 0 1 {x+w},{y+r} V{y+hh} Z" fill="{fill}"/>'
        s += f'<path d="M{x+w/2},{y+r} V{y+hh} M{x},{y+hh*.52} H{x+w}" stroke="#4a3b27" stroke-width="1.2" fill="none"/>'
        s += f'<path d="M{x+w/2-4},{y-2} l4,-6 l4,6 z" fill="#e9dcbd"/>'
    else:
        s += f'<rect x="{x-3}" y="{y-3}" width="{w+6}" height="{hh+3}" fill="#7d6b4c"/>'
        s += f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" fill="{fill}"/>'
        s += f'<path d="M{x+w/2},{y} V{y+hh} M{x},{y+hh*.5} H{x+w}" stroke="#4a3b27" stroke-width="1.2" fill="none"/>'
        s += f'<rect x="{x-3}" y="{y-8}" width="{w+6}" height="5" fill="#e9dcbd"/>'
    s += f'<path d="M{x},{y+hh} V{y+2} " stroke="#2d2418" stroke-opacity=".55" stroke-width="2" fill="none"/>'   # reveal shadow
    s += f'<rect x="{x-5}" y="{y+hh}" width="{w+10}" height="4" fill="#e9dcbd"/><rect x="{x-5}" y="{y+hh+4}" width="{w+10}" height="2" fill="#5a4a34" opacity=".5"/>'
    return s

house = []
h = house.append
# towers
for tx in (300, 1220):
    h(f'<polygon points="{tx-14},302 {tx+94},302 {tx+40},206" fill="url(#cone)"/>')
    h(f'<polygon points="{tx-14},302 {tx+94},302 {tx+40},206" fill="url(#slates)" opacity=".8"/>')
    h(f'<circle cx="{tx+40}" cy="203" r="5" fill="#4a5058"/><rect x="{tx+38}" y="186" width="4" height="18" fill="#4a5058"/>')
    h(f'<rect x="{tx}" y="300" width="80" height="336" fill="url(#towerShade)"/><rect x="{tx}" y="300" width="80" height="336" fill="url(#courses)"/><rect x="{tx}" y="300" width="80" height="336" filter="url(#stoneTex)" opacity=".8"/>')
    h(f'<rect x="{tx-4}" y="296" width="88" height="8" fill="#dccbaa"/><rect x="{tx-4}" y="304" width="88" height="3" fill="#5a4a34" opacity=".5"/>')
    h(f'<rect x="{tx}" y="418" width="80" height="4" fill="#8d7a58" opacity=".7"/>')
# wings
for wx in (380, 1020):
    h(roof(wx-12, wx+212, 424, 372, 20))
    h(wall(wx, 420, 200, 216, 'stone' if wx > 800 else 'stoneShade'))
    h(cornice(wx, 200, 420))
    h(quoins(wx, 424, 208)); h(quoins(wx+200, 424, 208, right=True))
    h(f'<rect x="{wx}" y="528" width="200" height="4" fill="#8d7a58" opacity=".6"/>')
# main block
h(roof(568, 1032, 394, 326, 26))
for dx in (620, 690, 910, 980):   # dormers
    h(f'<polygon points="{dx-16},366 {dx+16},366 {dx},346" fill="#5c6774"/><rect x="{dx-12}" y="366" width="24" height="26" fill="#cbb994"/><rect x="{dx-7}" y="370" width="14" height="18" fill="url(#glassDark)"/>')
h(wall(580, 390, 440, 246))
h(cornice(580, 440, 390))
h('<rect x="580" y="528" width="440" height="4" fill="#8d7a58" opacity=".6"/>')
h(quoins(580, 394, 240)); h(quoins(1020, 394, 240, right=True))
for cx_ in (640, 960):
    h(f'<rect x="{cx_}" y="292" width="20" height="50" fill="#5b5046"/><rect x="{cx_-3}" y="288" width="26" height="7" fill="#463c33"/><rect x="{cx_+3}" y="282" width="5" height="8" fill="#332c26"/><rect x="{cx_+12}" y="282" width="5" height="8" fill="#332c26"/>')
# pavilion (front)
h('<rect x="700" y="356" width="22" height="280" fill="#2a2116" opacity=".28"/>')   # cast shadow on the main block
h('<polygon points="704,354 896,354 800,290" fill="url(#slate)"/><polygon points="704,354 896,354 800,290" fill="url(#slates)" opacity=".8"/>')
h('<rect x="783" y="256" width="34" height="40" fill="#d3c29f"/><rect x="783" y="256" width="34" height="40" fill="url(#courses)"/><path d="M778,256 Q800,226 822,256 Z" fill="url(#cone)"/><rect x="798" y="214" width="4" height="14" fill="#4a5058"/><circle cx="800" cy="212" r="4" fill="#4a5058"/><rect x="794" y="266" width="12" height="20" fill="url(#glassDark)"/>')
h(wall(720, 350, 160, 286))
h(cornice(720, 160, 350))
h(quoins(720, 354, 280)); h(quoins(880, 354, 280, right=True))
h('<polygon points="716,352 884,352 800,300" fill="#e6d7b6" stroke="#8d7a58" stroke-width="2"/><polygon points="716,352 884,352 800,300" fill="url(#stoneTex)" opacity=".7"/>')
h('<path d="M716,352 H884" stroke="#5a4a34" stroke-opacity=".5" stroke-width="3"/>')
h('<circle cx="800" cy="330" r="11" fill="#f5ead0" stroke="#8d7a58" stroke-width="2"/><path d="M800,330 L800,322 M800,330 L805,333" stroke="#3b3128" stroke-width="1.5"/>')
h('<rect x="720" y="528" width="160" height="4" fill="#8d7a58" opacity=".6"/>')
# windows
left_wing = [400, 446, 492, 538]; right_wing = [1040, 1086, 1132, 1178]
main_l = [612, 660]; main_r = [908, 956]
for i, x in enumerate(main_l + main_r): h(win(x, 455, 26, 50, i % 2 == 0))
for i, x in enumerate(left_wing): h(win(x, 455, 26, 50, i in (1, 2)))
for i, x in enumerate(right_wing): h(win(x, 455, 26, 50, i in (0, 3)))
for x in main_l + main_r: h(win(x, 545, 26, 55, True))
for x in left_wing + right_wing: h(win(x, 545, 26, 55, True, True))
for tx in (300, 1220):
    h(win(tx+29, 470, 22, 34, False, True)); h(win(tx+29, 560, 22, 34, True, True))
    h(win(tx+22, 330, 36, 46, True, True))
# balcony window (Maiden Hall) and balcony
h(win(770, 428, 60, 66, True, True))
h('<rect x="756" y="505" width="88" height="7" fill="#dccbaa"/><rect x="756" y="512" width="88" height="3" fill="#5a4a34" opacity=".55"/>')
for i in range(10): h(f'<rect x="{763+i*8.2:.1f}" y="490" width="4" height="15" rx="2" fill="#cdbb95"/>')
h('<rect x="760" y="486" width="80" height="4" fill="#dccbaa"/>')
# gate
h('<rect x="746" y="512" width="16" height="124" fill="#d9c8a5"/><rect x="838" y="512" width="16" height="124" fill="#d9c8a5"/><rect x="746" y="512" width="16" height="124" fill="url(#courses)"/><rect x="838" y="512" width="16" height="124" fill="url(#courses)"/>')
h('<rect x="742" y="504" width="116" height="8" fill="#e6d7b6"/><rect x="742" y="512" width="116" height="3" fill="#5a4a34" opacity=".5"/>')
h('<path d="M766,636 V550 A34,34 0 0 1 834,550 V636 Z" fill="#6b5a40"/>')
h('<path d="M770,636 V552 A30,30 0 0 1 830,552 V636 Z" fill="url(#hall)"/>')
h('<path d="M770,636 V580 H786 V636 Z" fill="#3a2a18"/><path d="M830,636 V580 H814 V636 Z" fill="#3a2a18"/>')   # door leaves ajar
h('<path d="M786,580 V636 M814,580 V636" stroke="#241a10" stroke-width="2"/><path d="M774,590 h8 M774,604 h8 M818,590 h8 M818,604 h8" stroke="#8a6a3a" stroke-width="2"/>')
h('<path d="M772,552 A28,28 0 0 1 828,552" fill="none" stroke="#f3dea7" stroke-width="2" opacity=".7"/><path d="M800,524 V552 M786,528 L800,552 L814,528" stroke="#3a2a18" stroke-width="1.5" fill="none"/>')
h('<rect x="794" y="536" width="12" height="18" fill="#e9dcbd" stroke="#8d7a58" stroke-width="1.2"/>')
for lx in (736, 856):
    h(f'<rect x="{lx-4}" y="560" width="8" height="12" fill="#2b2622"/><rect x="{lx-14}" y="536" width="28" height="30" fill="url(#glow)" class="lit"/><rect x="{lx-5}" y="544" width="10" height="16" fill="#f1c56a"/><path d="M{lx-7},544 h14 l-2,-5 h-10 z" fill="#2b2622"/>')
# steps and terrace
h('<rect x="260" y="636" width="1080" height="22" fill="#cdbd97"/><rect x="260" y="636" width="1080" height="22" fill="url(#gravel)"/><rect x="260" y="658" width="1080" height="4" fill="#5a4a34" opacity=".35"/>')
h('<rect x="742" y="636" width="116" height="8" fill="#e2d4b2"/><rect x="732" y="644" width="136" height="8" fill="#d6c6a2"/><rect x="722" y="652" width="156" height="8" fill="#c9b893"/><rect x="722" y="660" width="156" height="3" fill="#5a4a34" opacity=".4"/>')
house_svg = ''.join(house)

# ------------------------------------------------------------------ lake with the reflection
add('<path d="M0,700 C120,676 300,668 470,684 C600,696 700,720 740,776 C770,820 740,868 660,900 L0,900 Z" fill="url(#lake)"/>')
add('<g id="house">' + house_svg + '</g>')
add('<g clip-path="url(#lakeClip)" mask="url(#reflMask)" filter="url(#ripple)"><use href="#house" transform="translate(0,1316) scale(1,-1)"/></g>')
add('<path d="M0,700 C120,676 300,668 470,684 C600,696 700,720 740,776 C770,820 740,868 660,900 L0,900 Z" fill="url(#lakeSheen)"/>')
add('<g class="glint" stroke="#fff3d2" stroke-opacity=".6" stroke-width="1.4">')
for (x, y, l) in [(160,760,70),(300,790,110),(430,742,60),(540,780,90),(610,822,70),(240,830,80),(380,860,60)]:
    add(f'<line x1="{x}" y1="{y}" x2="{x+l}" y2="{y}"/>')
add('</g>')
add('<path d="M0,700 C120,676 300,668 470,684 C600,696 700,720 740,776" fill="none" stroke="#c9d4c1" stroke-width="3" opacity=".6"/>')
# reeds on the near bank
for i in range(26):
    x = random.randint(20, 640); y = random.randint(860, 900)
    add(f'<path d="M{x},{y} q3,-30 {random.randint(-4,4)},-{random.randint(34,60)}" stroke="#2f4a2a" stroke-width="2" fill="none"/>')

# ------------------------------------------------------------------ lighting on the house
add('<g clip-path="url(#houseClip)"><rect x="280" y="200" width="1040" height="460" fill="url(#light)"/></g>')
add('<ellipse cx="800" cy="664" rx="580" ry="18" fill="#1e150c" opacity=".35" filter="url(#soft6)"/>')

# ------------------------------------------------------------------ path
add('<polygon points="740,662 860,662 960,900 640,900" fill="#cbb98e"/><polygon points="740,662 860,662 960,900 640,900" fill="url(#gravel)"/>')
add('<polygon points="762,662 838,662 880,900 720,900" fill="#e0d1ab" opacity=".45"/>')
add('<polygon points="632,900 740,662 748,662 650,900" fill="#35472a" opacity=".35"/>')

# ------------------------------------------------------------------ parterre
add('<rect x="1010" y="700" width="540" height="190" rx="10" fill="url(#lawn)"/><rect x="1010" y="700" width="540" height="190" rx="10" filter="url(#grassTex)" opacity=".5"/>')
add('<path d="M1010,795 H1550 M1275,700 V890" stroke="#c8b78f" stroke-width="10"/><path d="M1010,795 H1550 M1275,700 V890" stroke="url(#gravel)" stroke-width="10"/>')
for (x, y, w, hh) in [(1030,715,210,18),(1310,715,210,18),(1030,860,210,18),(1310,860,210,18),(1030,733,18,127),(1222,733,18,50),(1222,810,18,50),(1310,733,18,50),(1310,810,18,50),(1512,733,18,127)]:
    add(f'<rect x="{x+3}" y="{y+5}" width="{w}" height="{hh}" rx="7" fill="#1e2e1a" opacity=".45" filter="url(#soft2)"/>')
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" rx="7" fill="url(#hedge)"/>')
for (x, y) in [(1130, 790), (1420, 790)]:
    add(f'<ellipse cx="{x}" cy="{y}" rx="72" ry="42" fill="#4f7a3f"/><ellipse cx="{x}" cy="{y}" rx="72" ry="42" filter="url(#grassTex)" opacity=".5"/>')
    for i in range(34):
        fx = x + random.randint(-62, 62); fy = y + random.randint(-32, 32); r = random.choice([2.5, 3, 3.5, 4])
        c = random.choice(["#e18ba7", "#f1d16b", "#f6f1e3", "#d9645e", "#c47ad6"])
        add(f'<circle cx="{fx}" cy="{fy+1}" r="{r}" fill="#233a1f" opacity=".4"/><circle cx="{fx}" cy="{fy}" r="{r}" fill="{c}"/>')
add('<ellipse cx="1275" cy="800" rx="48" ry="18" fill="#6f8188"/><ellipse cx="1275" cy="796" rx="42" ry="14" fill="#b8ccd3"/><ellipse cx="1275" cy="794" rx="34" ry="9" fill="#dfeef2" opacity=".7"/>')
add('<rect x="1270" y="758" width="10" height="36" fill="#cdbfa1"/><ellipse cx="1275" cy="758" rx="16" ry="6" fill="#dccbaa"/><ellipse cx="1275" cy="758" rx="10" ry="3" fill="#9fb8c2"/>')
add('<path class="jet" d="M1275,756 q-7,-28 0,-44 q7,16 0,44" fill="#eef7fb" opacity=".85" filter="url(#soft2)"/>')
add('<path d="M1225,730 v-22 a25,25 0 0 1 50,0 v22" fill="none" stroke="#1e2e1a" stroke-width="14" opacity=".4"/><path d="M1225,728 v-22 a25,25 0 0 1 50,0 v22" fill="none" stroke="url(#hedge)" stroke-width="12"/>')

# ------------------------------------------------------------------ trees
def tree(x, y, scale, seed):
    rnd = random.Random(seed)
    s = f'<g transform="translate({x},{y}) scale({scale})">'
    s += '<ellipse cx="30" cy="300" rx="150" ry="24" fill="#1a2a17" opacity=".45" filter="url(#soft6)"/>'
    s += '<path d="M-6,300 C-10,200 -14,120 4,20 L36,20 C48,120 40,200 34,300 Z" fill="url(#trunk)"/>'
    s += '<path d="M12,80 L-60,30 M22,60 L80,10 M18,120 L-40,100" stroke="#3a2a1c" stroke-width="10" stroke-linecap="round"/>'
    s += '<g filter="url(#leaf)">'
    blobs = []
    for i in range(34):
        bx = rnd.gauss(10, 70); by = rnd.gauss(-20, 60); r = rnd.uniform(28, 62)
        blobs.append((bx, by, r))
    for (bx, by, r) in blobs:
        s += f'<circle cx="{bx:.0f}" cy="{by:.0f}" r="{r:.0f}" fill="#1f3a20"/>'
    for (bx, by, r) in blobs:
        s += f'<circle cx="{bx-6:.0f}" cy="{by-8:.0f}" r="{r*.8:.0f}" fill="#2f5230" opacity=".9"/>'
    for (bx, by, r) in blobs[::2]:
        s += f'<circle cx="{bx+10:.0f}" cy="{by-16:.0f}" r="{r*.4:.0f}" fill="#5f8a44" opacity=".35"/>'
    s += '</g></g>'
    return s
add('<g id="leftTree">' + tree(120, 600, 1.15, 3) + '</g>')
add(tree(1520, 640, .8, 9))
add('<g clip-path="url(#lakeClip)" mask="url(#reflMask)" filter="url(#ripple)" opacity=".5"><use href="#leftTree" transform="translate(0,1400) scale(1,-1)"/></g>')
# foreground bushes, slightly out of focus
add('<g filter="url(#soft2)"><ellipse cx="150" cy="905" rx="220" ry="60" fill="#213a1f"/><ellipse cx="1500" cy="905" rx="220" ry="50" fill="#243d22"/></g>')

# ------------------------------------------------------------------ air
add('<g class="birds" stroke="#2f3640" stroke-width="1.6" fill="none">')
for (x, y, s) in [(1010,190,1),(1048,206,.8),(1084,186,.9),(1120,214,.7)]:
    add(f'<path transform="translate({x},{y}) scale({s})" d="M0,0 q7,-8 14,0 q7,-8 14,0"/>')
add('</g>')
add('<g class="smoke" fill="#efe7d6" opacity=".5">')
for cx_ in (650, 970):
    for i, (dx, dy, r) in enumerate([(0,-10,7),(6,-30,10),(-4,-52,13)]):
        add(f'<circle class="p{i}" cx="{cx_+dx}" cy="{284+dy}" r="{r}" filter="url(#soft2)"/>')
add('</g>')

# ------------------------------------------------------------------ post
add('<rect width="1600" height="900" filter="url(#grain)" style="mix-blend-mode:multiply"/>')
add('<rect width="1600" height="900" fill="url(#vignette)"/>')

svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 900" '
       'role="img" aria-label="The house on the lake at golden hour: a chateau with two towers and wings, a lit gate, a parterre garden and a lake.">'
       + '\n'.join(P) + '</svg>\n')
out = Path(__file__).resolve().parent.parent / 'assets' / 'castle-painting.svg'
out.write_text(svg)
print(f'wrote {out} ({len(svg)//1024} KB, {svg.count("<")} elements)')
