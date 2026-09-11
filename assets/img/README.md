# Scene images

Every scene of the house has a photo slot. Put a file with the exact name below in this
folder and the page uses it automatically (the drawn SVG scene stays as the fallback when
the file is missing). No code changes are needed.

| File | Used by | Size | Notes |
|---|---|---|---|
| `castle.jpg` | landing page (the painting) | 1600 x 900 (16:9) | composition must match the hotspots, see below |
| `fin-lab.jpg` | Fin Lab | 1920 x 1080 | full-bleed background |
| `legal-quarter.jpg` | Legal Quarter | 1920 x 1080 | |
| `library.jpg` | Library | 1920 x 1080 | |
| `maiden-hall.jpg` | Maiden Hall | 1920 x 1080 | |
| `garden.jpg` | Garden | 1920 x 1080 | |
| `bedroom.jpg` | Bedroom | 1920 x 1080 | |

The analyst portrait lives at `fin-lab/assets/analyst.jpg` (already in place).

Keep files under about 800 KB each (JPEG quality 80 is plenty); images are served straight
from GitHub Pages. Text on the page sits over the lower-left area of each scene, so keep
that region calm.

## Prompts

These prompts produce scenes that fit the pages and the hotspot layout. Use them as they
are or adjust the mood; keep the composition notes.

**castle.jpg**
> Photorealistic 18th-to-19th-century European château on a lake at golden hour, seen
> frontally from the lawn: symmetrical limestone façade, central arched main gate with a
> warmly lit hallway and a pediment above it, two long wings with rows of tall windows, a
> round tower with a conical slate roof at each end, warm light in the windows, a formal
> parterre garden with a fountain in the lower right, a lake in the lower left reflecting the
> house, tall trees framing the left edge, distant blue mountains, soft clouds. The feel of a
> 19th-century naturalist landscape painting rendered as a photograph. Natural light, no
> people, no text.
>
> Negative: cartoon, illustration, flat, low detail, text, watermark, people.

Composition for the hotspots (fractions of width x height): gate at the centre, its arch
between 57% and 70% of the height; wings' ground-floor windows at 60-68% height, left wing
around 25-35% width, right wing around 65-75%; towers at about 20% and 80% width with their
upper window at 35-42% height; the balcony window over the gate at 47-56% height; garden in
the lower right quarter. If your image differs, move the `hotspot` boxes in
`assets/rooms.js` (units are the 1600 x 900 grid).

**fin-lab.jpg**
> Photorealistic trading-floor office at dusk: floor-to-ceiling windows over a city
> skyline, rows of desks with dark monitors showing only faint grid lines, one warm desk
> lamp, empty chairs, cinematic lighting, no people, no readable text.

**legal-quarter.jpg**
> Photorealistic old law chambers: walnut panelling, shelves of leather-bound volumes with
> gold tooling, a green banker's lamp on a mahogany desk, brass fittings, warm dim light,
> a little dust in the air, no people, no readable text.

**library.jpg**
> Photorealistic private library: floor-to-ceiling wooden bookshelves, a rolling ladder, a
> reading table with a lamp and a globe, warm light, no people, no readable text.

**maiden-hall.jpg**
> Photorealistic 19th-century European drawing room: pale blue and cream panelled walls,
> tall windows with sheer curtains, a crystal chandelier, a settee, a writing desk, clean and
> airy morning light, no people, no readable text.

**garden.jpg**
> Photorealistic English garden: lawn, clipped hedges, flower beds in bloom, a pond with
> water lilies, a wooden bench under a hedge, soft afternoon sunlight, no people.

**bedroom.jpg**
> Photorealistic luxurious bedroom under warm lamplight: canopy bed in burgundy and cream,
> heavy curtains, two bedside lamps, moonlit window, no people.
