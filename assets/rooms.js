/* Lobby room registry.
   One entry per room of the house. The landing page (castle painting and
   room cards), the password gate and the breadcrumbs all read from it.
   locked: true means the gate asks for that room's key (see gate.js). */
window.LOBBY_ROOMS = [
  { id: 'market-board-facade', name: 'Market Board Facade', folder: 'market-board-facade/', locked: false,
    place: 'the main gate',
    summary: 'The financial market board, shown as a dashboard. Data will be uploaded, auto-updated, or extracted from the Fin Lab; for now it runs on a sample dataset.',
    why: 'On the facade because it is meant to be seen from outside: the one room that is open to everyone.' },
  { id: 'fin-lab', name: 'Fin Lab', folder: 'fin-lab/', locked: true,
    place: 'west wing, ground floor',
    summary: 'Market commentary and analyst reports, accumulated over time. Sources and links will be connected once the database exists.',
    why: 'Beside the gate: what the lab gathers is what the Market Board outside will show.' },
  { id: 'legal-quarter', name: 'Legal Quarter', folder: 'legal-quarter/', locked: true,
    place: 'east wing, ground floor',
    summary: 'Financial-law knowledge and advisory notes. Space reserved.',
    why: 'Across the hall from the Fin Lab: the law of the financial market sits next to the market itself.' },
  { id: 'maiden-hall', name: 'Maiden Hall', folder: 'maiden-hall/', locked: true,
    place: 'piano nobile, above the gate',
    summary: 'Report scaffolds, speech drafts, work materials and support tools. Space reserved.',
    why: 'The drawing room over the door, between the Fin Lab and the Legal Quarter: where what both produce is written up.' },
  { id: 'library', name: 'Library', folder: 'library/', locked: true,
    place: 'west tower',
    summary: 'General knowledge, accumulated and retrieved. Space reserved.',
    why: 'A study in the tower above the Fin Lab: the wider reading the lab draws on.' },
  { id: 'bedroom', name: 'Bedroom', folder: 'bedroom/', locked: true,
    place: 'east tower',
    summary: 'Rest. Design only.',
    why: 'Private quarters, furthest from the gate.' },
  { id: 'garden', name: 'Garden', folder: 'garden/', locked: true,
    place: 'the grounds',
    summary: 'Leisure and lighter things. Design only.',
    why: 'Outside the walls: where the house goes to breathe.' }
];
