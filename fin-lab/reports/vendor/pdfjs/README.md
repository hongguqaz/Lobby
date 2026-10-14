# pdf.js 4.10.38 (vendored)

`pdf.min.mjs` and `pdf.worker.min.mjs` are the unmodified `build/` files of the npm package
`pdfjs-dist@4.10.38` (Mozilla's PDF.js, Apache-2.0, see LICENSE). The Fin Lab boards load them with a
dynamic `import()` to draw PDFs page by page on canvases, so a report opens in place on every browser,
including phones whose browsers have no PDF viewer of their own. CMaps and standard fonts, needed only
for PDFs that do not embed their fonts, are fetched from unpkg on demand (`pdfjs-dist@4.10.38/cmaps/`,
`standard_fonts/`).

To update: `npm pack pdfjs-dist@<version>`, copy the two build files and LICENSE here, and change the
version in `fin-lab/reports/board.js` (PDFJS) and in this file.
