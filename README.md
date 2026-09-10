# Lobby

The public front of a private house. The landing page is a painting of the house on the lake in the
manner of a 19th-century landscape: the **Market Board Facade** is entered by the main gate and is open
to everyone; the other rooms are reached through the windows of the quarter they belong to, and each
asks for a key.

**Live site:** https://hongguqaz.github.io/Lobby/ (after GitHub Pages is enabled, see below)

```
Drive (private)                              Lobby (public, this repository)
  market-board-facade/  data + pipeline  -->   market-board-facade/  the board, as a dashboard   (open)
  fin-lab/              reserved         -->   fin-lab/              trading-floor office        (key)
  legal-quarter/        reserved         -->   legal-quarter/        walnut-panelled chambers    (key)
  library/              reserved         -->   library/              the study in the west tower (key)
  maiden-hall/          reserved         -->   maiden-hall/          drawing room over the gate  (key)
  garden/               reserved         -->   garden/               the grounds                 (key)
  bedroom/              reserved         -->   bedroom/              the east tower              (key)
                                               index.html            the painting
```

Only result files cross from Drive to Lobby. Source data never enters this repository.

## The rooms and where they sit

| Room | Where in the house | Why there | Status |
|---|---|---|---|
| Market Board Facade | the main gate | meant to be seen from outside | open, sample data |
| Fin Lab | west wing, ground floor | what it gathers feeds the board outside | reserved |
| Legal Quarter | east wing, ground floor | the law of the market beside the market | reserved |
| Maiden Hall | piano nobile, over the gate | where the work of both wings is written up | reserved |
| Library | west tower | the wider reading the lab draws on | reserved |
| Bedroom | east tower | private quarters, furthest from the gate | design only |
| Garden | the grounds | outside the walls, for lighter things | design only |

`assets/rooms.js` is the registry the painting's cards and the gate read from. The hotspots in the
painting are `<a class="hotspot" data-room="...">` elements inside the inline SVG of `index.html`.

## Keys

Every room except the facade is behind a key. The gate is client-side (`assets/gate.js`): each room's
key is stored as a SHA-256 hash, the visitor's key is hashed in the browser and compared, and an
unlocked room is remembered for the browser session. **All rooms currently use the key `1111`.**

To change a key, hash the new one and paste it into `KEYS` in `assets/gate.js`:

```bash
python3 -c "import hashlib;print(hashlib.sha256(b'NEW-KEY').hexdigest())"
```

Because the site is static and public, this keeps casual visitors out but is **not real security**:
the room pages are in the repository and anyone who reads the page source can bypass the gate. For
material that must stay private, keep it in Drive.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The painting, with hotspots, room cards and the gate. |
| `assets/rooms.js` | Room registry: names, folders, placement, lock state. |
| `assets/gate.js`, `assets/gate.css` | The password gate and its brass plate. |
| `assets/castle.js`, `assets/site.css` | Landing-page behaviour and styles. |
| `assets/tokens.css` | Light/dark tokens for the landing page and the board. |
| `assets/rooms.css` | Shared skeleton for the room pages; each page sets its own palette. |
| `market-board-facade/` | The board: `index.html`, `assets/`, `data/dashboard.json` from the private pipeline. |
| `fin-lab/` | Office scene, ticker, and the analyst: an illustrated guide (`assets/figure.js`) who talks, blinks, follows the pointer and waves when clicked. |
| `legal-quarter/`, `library/`, `maiden-hall/`, `garden/`, `bedroom/` | Themed placeholder rooms, each a single `index.html`. |
| `scripts/check_public_data.py` | CI guard: no spreadsheets or photographs committed, published aggregate well-formed. |
| `.github/workflows/pages.yml` | Runs the guard on every push, deploys the default branch to GitHub Pages. |

## The Market Board Facade

`market-board-facade/index.html` renders `market-board-facade/data/dashboard.json`. The board is meant
for financial market data (uploaded, auto-updated, or extracted from the Fin Lab); until that database
exists it demonstrates the mechanics with a synthetic vendor dataset, and says so in a banner. The
published data holds names and per-period sums and counts only, never rows, identifiers or free text.

## Viewing locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000     # then open http://localhost:8000/
```

## One-time setup

- **GitHub Pages**: Settings > Pages > *Build and deployment* > Source: **GitHub Actions**. Until it is
  enabled the deploy job is skipped with a warning and only the data check runs.
- **Publishing token**: Drive needs a secret `LOBBY_DEPLOY_TOKEN` with *Contents: Read and write* on
  this repository. Details are in Drive's README.
- **Keys**: change the shared `1111` before putting anything sensitive behind a door.
