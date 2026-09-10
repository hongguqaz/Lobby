/* Lobby feature map.
   This is the single place to edit when a feature is added, renamed, or
   connected to another one. The network, the detail panel and the feature
   cards on the landing page are all generated from it.

   status: 'live' (built and linked), 'planned' (folder reserved, placeholder
   page), 'empty' (an open slot with no name yet). angle: position on the orbit
   in degrees, 0 = right, -90 = top. */
window.__LOBBY_FEATURES__ = {
  core: {
    id: 'drive', name: 'Drive', status: 'core', glyph: 'lock',
    caption: 'private data & pipelines',
    description: 'The private repository that holds the source data and the pipelines that turn it into publishable results. Nothing in it is public; each feature receives only its own aggregated output.'
  },
  features: [
    {
      id: 'dashboard', name: 'Dashboard', status: 'live', angle: -120, glyph: 'chart',
      url: 'dashboard/', folder: 'dashboard/',
      summary: 'Vendor spend and performance at a glance.',
      description: 'Interactive charts and tables built from aggregated vendor records: spend over time, top vendors, concentration, delivery and rating trends, with filters and table views.'
    },
    {
      id: 'research', name: 'Research', status: 'planned', angle: -60, glyph: 'search',
      url: 'research/', folder: 'research/',
      summary: 'Deeper analysis and written findings.',
      description: 'Reserved for work that goes beyond the dashboard: vendor risk, cost drivers and published findings. The folder exists on both sides; the content is not built yet.'
    },
    { id: 'slot-1', status: 'empty', angle: 0 },
    { id: 'slot-2', status: 'empty', angle: 60 },
    { id: 'slot-3', status: 'empty', angle: 120 },
    { id: 'slot-4', status: 'empty', angle: 180 }
  ],
  links: [
    { from: 'drive', to: 'dashboard', kind: 'data', label: 'aggregated vendor data' },
    { from: 'drive', to: 'research', kind: 'data', label: 'source material' },
    { from: 'dashboard', to: 'research', kind: 'concept', label: 'metrics ↔ findings',
      detail: 'metrics raise questions, findings explain metrics' },
    { from: 'drive', to: 'slot-1', kind: 'reserved' },
    { from: 'drive', to: 'slot-2', kind: 'reserved' },
    { from: 'drive', to: 'slot-3', kind: 'reserved' },
    { from: 'drive', to: 'slot-4', kind: 'reserved' }
  ]
};
