# Lobby

The public front of a private workspace. Each feature lives in its own folder and is a
self-contained static sub-site; the landing page maps the features and how they relate.

**Live site:** https://hongguqaz.github.io/Lobby/ (after GitHub Pages is enabled, see below)

```
Drive (private)                         Lobby (public, this repository)
  dashboard/  data + pipeline   ---->     dashboard/   charts built from the published aggregate
  research/   reserved          ---->     research/    placeholder
  <feature>/  ...               ---->     <feature>/   ...
                                          index.html   the feature map
```

Only result files cross from Drive to Lobby. Source data never enters this repository.

## Structure

| Path | What it is |
|---|---|
| `index.html` | Landing page: a network map of the features, a detail panel, feature cards. |
| `assets/features.js` | **The feature map.** Nodes, statuses, positions and links. Edit this to add or connect a feature. |
| `assets/network.js`, `assets/site.css` | Landing page rendering and styles. |
| `assets/tokens.css` | Design tokens (light and dark palette) shared by every page. |
| `dashboard/` | **Live.** The vendor dashboard: `index.html`, `assets/`, and `data/dashboard.json` written by the private pipeline. |
| `research/` | **Planned.** Placeholder page; the folder is reserved on both sides. |
| `scripts/check_public_data.py` | CI guard: no raw data committed, published aggregate well-formed. |
| `.github/workflows/pages.yml` | Runs the guard on every push, deploys the default branch to GitHub Pages. |

Four more slots on the map are intentionally empty.

## The feature map

The landing page draws a network: the private Drive in the centre, features on an orbit
around it. Solid lines carry data out of Drive into a feature, the dotted line marks a
conceptual link between features (the Dashboard's metrics raise questions that Research
is meant to answer), and dashed lines lead to open slots. Hovering or focusing a node
highlights its connections and explains them in the side panel; clicking a live or
planned feature opens it. The feature cards below the map carry the same information as
plain text.

### Adding a feature

1. Create `<feature>/index.html` (link `../assets/tokens.css` and `../assets/site.css`
   for the shared look, and add the breadcrumb back to the Lobby).
2. Add an entry to `features` in `assets/features.js` (or turn an empty slot into a named
   one) and its links in `links`. Positions are angles on the orbit.
3. If it publishes data from Drive, keep the data under `<feature>/data/` and extend
   `scripts/check_public_data.py` with the new file's schema.
4. Create the matching `<feature>/` folder in Drive for the private side.

## The dashboard

`dashboard/index.html` renders `dashboard/data/dashboard.json`: filters, key figures, spend
over time by category, top vendors, category and region shares, vendor concentration,
amount by status, on-time delivery and rating trends, and a sortable vendor table. Every
chart has a table view, keyboard-accessible tooltips, and light/dark themes. Charts that
depend on optional columns appear only when the private data contains them. If the page
shows a *"Showing synthetic sample data"* banner, the private data folder was empty at the
last build.

The published data contains vendor, category, region and status names, and per period the
summed amount, transaction count and (where present) on-time counts, rating sums and
quantities. It never contains spreadsheets, file or sheet names, individual rows,
identifiers, descriptions or contact details. Spreadsheet files are git-ignored here, and
the guard script fails the build if raw data or unexpected fields appear.

## Viewing locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000     # then open http://localhost:8000/
```

## One-time setup

- **GitHub Pages**: Settings > Pages > *Build and deployment* > Source: **GitHub Actions**.
  The workflow cannot switch this on by itself; until it is enabled, the deploy job is
  skipped with a warning and only the data check runs.
- **Publishing token**: Drive needs a secret `LOBBY_DEPLOY_TOKEN`, a fine-grained token
  with *Contents: Read and write* on this repository. Details are in Drive's README.
