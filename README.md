# Lobby - vendor dashboard

A static dashboard of vendor spend and performance, published with GitHub Pages.

**Live page:** https://hongguqaz.github.io/Lobby/ (after Pages is enabled, see below)

```
private spreadsheets  ->  private pipeline  ->  data/dashboard.json  ->  this page
   (Drive repo)            (Drive repo)         (the only thing shared)   (GitHub Pages)
```

The spreadsheets never enter this repository. The private
[Drive](https://github.com/hongguqaz/Drive) repository holds them together with the
pipeline that aggregates them; only the aggregated `data/dashboard.json` is pushed here.
If the page shows a *"Showing synthetic sample data"* banner, the private data folder was
empty when the data was last built and the pipeline used its built-in sample.

## What the dashboard shows

- **Filters** (one row, scoping everything below): period presets and a custom range,
  category, region, status and vendor.
- **Key figures**: total spend, transactions, average transaction, active vendors, top-5
  vendor share, on-time delivery rate and average rating, each with the change against
  the previous period of the same length when one exists.
- **Charts**: spend over time stacked by category, top vendors, spend by category and by
  region, vendor concentration (cumulative share by rank against the 80% line), amount by
  status, on-time delivery and average rating over time.
- **Vendor table**: sortable, with a trend sparkline, change versus the previous period,
  on-time rate and rating per vendor.
- Every chart has a **Table** toggle with the same numbers as text, hover and keyboard
  tooltips, and light/dark themes (follows the system, with a manual toggle).

Charts that depend on optional columns (category, region, status, on-time, rating) only
appear when the private data contains them.

## What is (and is not) in the published data

`data/dashboard.json` contains vendor, category, region and status names; per period
(month by default) and combination of those dimensions, the summed amount, the number of
transactions and, where present, on-time counts, rating sums and quantities; headline
totals; the period range; a build date and the source commit hash.

It never contains the spreadsheets, file or sheet names, individual rows, identifiers,
descriptions, contact details, or any column beyond the nine canonical fields. The
private pipeline enforces this with an allow-list and a content scan, and this repository
double-checks it on every push (`scripts/check_public_data.py`). Spreadsheet files are
also git-ignored here so they cannot be committed by accident.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | The dashboard page. |
| `assets/style.css`, `assets/app.js` | Styling and rendering (plain JavaScript and SVG, no dependencies). |
| `data/dashboard.json` | Aggregated data, written by the private pipeline. |
| `data/dashboard.js` | The same data wrapped for loading straight from disk. |
| `scripts/check_public_data.py` | CI guard: no raw data committed, published data well-formed. |
| `.github/workflows/pages.yml` | Runs the guard on every push and deploys the default branch to GitHub Pages. |

## Viewing locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python -m http.server 8000     # then open http://localhost:8000/
```

To preview new data before it is published, copy `dashboard.json` and `dashboard.js`
from the private pipeline's `build/` folder into `data/`.

## How updates happen

1. Spreadsheets are added or changed in the private repository and pushed.
2. Its workflow runs the pipeline tests, builds the aggregates, and commits
   `data/dashboard.json` and `data/dashboard.js` to this repository.
3. This repository's workflow runs the guard and redeploys the page.

## One-time setup

- **GitHub Pages**: Settings > Pages > *Build and deployment* > Source: **GitHub Actions**.
  The workflow cannot switch this on by itself; until it is enabled, the deploy job is
  skipped with a warning and only the data check runs.
- **Publishing token**: the private repository needs a secret `LOBBY_DEPLOY_TOKEN`, a
  fine-grained personal access token with *Contents: Read and write* on this repository.
  Details are in the private repository's README.
