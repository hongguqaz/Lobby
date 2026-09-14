# Scene images

Every scene of the house has a photo slot. Put a file with the exact name below in this
folder and the page uses it automatically (the drawn SVG scene stays as the fallback when
the file is missing). No code changes are needed.

**Generating them.** `prompts.json` here is the source of truth (one prompt per scene, a
shared `style` suffix, and the analyst's base prompt plus one line per keyframe) and
`tools/gen_images.py` turns it into images with the OpenAI image API. The easiest way to run
it is the *Generate scene images* workflow (Actions tab > Run workflow): it needs one
repository secret, `OPENAI_API_KEY`, and commits the results itself. Inputs: `only` to
regenerate a single scene or `figure`, `quality` (low/medium/high/xhigh/max, or `config` for
the per-item value in `prompts.json`, currently xhigh), `model` (`auto` = newest gpt-image
model, preferring the quality variant such as gpt-image-2.5-sunburst), and `candidates`. Locally:
`OPENAI_API_KEY=... python3 tools/gen_images.py --only castle`.

**Choosing between variants.** With `candidates` = 2 or more, nothing goes live: the variants
land in `assets/img/candidates/<scene>-<k>.jpg` and `fin-lab/assets/frames/candidates/<frame>-<k>.jpg`.
Review them (`python3 tools/promote_candidates.py --sheet sheet.jpg` builds a contact sheet),
then `python3 tools/promote_candidates.py castle=2 garden=1 look=1 ... --first --clean` copies
the picks to their final names and deletes the candidates folders. Commit and push.

The castle is produced with the image-edit endpoint from `castle-reference.jpg` (the drawn
scene rendered at 2048 x 1152) so the gate, wings and towers stay where the hotspots expect
them. Open the landing page with `#calibrate` in the URL to see the hotspot boxes over the
finished photo and adjust `assets/rooms.js` if needed.

The analyst's keyframes (`fin-lab/assets/frames/`) are edits of her portrait with only the
pose changed, so she stays the same person while the page crossfades between them.

| File | Used by | Size | Notes |
|---|---|---|---|
| `castle.jpg` | landing page (the painting) | 2048 x 1152 (16:9) | composition must match the hotspots, see below |
| `fin-lab.jpg` | Fin Lab | 2048 x 1152 | full-bleed background |
| `legal-quarter.jpg` | Legal Quarter | 2048 x 1152 | |
| `library.jpg` | Library | 2048 x 1152 | |
| `maiden-hall.jpg` | Maiden Hall | 2048 x 1152 | |
| `garden.jpg` | Garden | 2048 x 1152 | |
| `bedroom.jpg` | Bedroom | 2048 x 1152 | |

The analyst portrait lives at `fin-lab/assets/analyst.jpg` (already in place).

Keep files under about 900 KB each (the generator recompresses to stay below that);
images are served straight from GitHub Pages. Any 16:9 size works for a hand-made
replacement.

## Prompts

The prompts live in `prompts.json`; each scene prompt is followed by the shared `style`
suffix when it is sent. Two composition rules are baked into them and must survive any edit:

- **Castle.** It is an *edit* of `castle-reference.jpg`, so the prompt names where every
  clickable element already sits (fractions of width x height): gate at the centre with its
  arch between 57% and 70% of the height; wings' ground-floor windows at 60-68% height, left
  wing around 25-35% width, right wing around 65-75%; towers at about 20% and 80% width with
  their upper window at 35-42% height; the balcony window over the gate at 47-56% height;
  parterre garden in the lower right, lake in the lower left. If a generated image differs,
  move the `hotspot` boxes in `assets/rooms.js` (units are the 1600 x 900 grid) with the
  `#calibrate` view.
- **Rooms.** The page lays its title, paragraph and cards over roughly the upper 60% of the
  image, strongest at the upper left, so every room prompt keeps that region calm and puts
  the detailed set dressing lower and to the right.
- **Analyst keyframes.** Each is an edit of `fin-lab/assets/analyst.jpg` with only the pose
  and expression changed, so she stays the same person while the page crossfades between
  `look`, `talk`, `wave`, `point`, `blink` and `listen`.
