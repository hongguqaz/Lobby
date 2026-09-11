/* Lobby room registry.
   One entry per room of the house. The landing page (castle painting and
   room cards), the password gate and the breadcrumbs all read from it.
   locked: true means the gate asks for that room's key (see gate.js).
   hotspot/plate: where the room sits in the painting, on a 1600 x 900 grid;
   move them if assets/img/castle.jpg is composed differently. */
window.LOBBY_ROOMS = [
  { id: 'market-board-facade', hotspot: { x: 738, y: 500, w: 124, h: 164 }, plate: { x: 800, y: 682 }, name: 'Market Board Facade', folder: 'market-board-facade/', locked: false,
    place: 'the main gate',
    summary: 'The financial market board, shown as a dashboard. Data will be uploaded, auto-updated, or extracted from the Fin Lab; for now it runs on a sample dataset.',
    why: 'On the facade because it is meant to be seen from outside: the one room that is open to everyone.' },
  { id: 'fin-lab', hotspot: { x: 390, y: 532, w: 180, h: 82 }, plate: { x: 480, y: 524 }, name: 'Fin Lab', folder: 'fin-lab/', locked: true,
    place: 'west wing, ground floor',
    summary: 'Market commentary and analyst reports, accumulated over time. Sources and links will be connected once the database exists.',
    why: 'Beside the gate: what the lab gathers is what the Market Board outside will show.' },
  { id: 'legal-quarter', hotspot: { x: 1030, y: 532, w: 180, h: 82 }, plate: { x: 1120, y: 524 }, name: 'Legal Quarter', folder: 'legal-quarter/', locked: true,
    place: 'east wing, ground floor',
    summary: 'Financial-law knowledge and advisory notes. Space reserved.',
    why: 'Across the hall from the Fin Lab: the law of the financial market sits next to the market itself.' },
  { id: 'maiden-hall', hotspot: { x: 752, y: 416, w: 96, h: 100 }, plate: { x: 800, y: 406 }, name: 'Maiden Hall', folder: 'maiden-hall/', locked: true,
    place: 'piano nobile, above the gate',
    summary: 'Report scaffolds, speech drafts, work materials and support tools. Space reserved.',
    why: 'The drawing room over the door, between the Fin Lab and the Legal Quarter: where what both produce is written up.' },
  { id: 'library', hotspot: { x: 312, y: 318, w: 56, h: 66 }, plate: { x: 340, y: 306 }, name: 'Library', folder: 'library/', locked: true,
    place: 'west tower',
    summary: 'General knowledge, accumulated and retrieved. Space reserved.',
    why: 'A study in the tower above the Fin Lab: the wider reading the lab draws on.' },
  { id: 'bedroom', hotspot: { x: 1232, y: 318, w: 56, h: 66 }, plate: { x: 1260, y: 306 }, name: 'Bedroom', folder: 'bedroom/', locked: true,
    place: 'east tower',
    summary: 'Rest. Design only.',
    why: 'Private quarters, furthest from the gate.' },
  { id: 'garden', hotspot: { x: 1010, y: 692, w: 540, h: 200 }, plate: { x: 1275, y: 684 }, name: 'Garden', folder: 'garden/', locked: true,
    place: 'the grounds',
    summary: 'Leisure and lighter things. Design only.',
    why: 'Outside the walls: where the house goes to breathe.' }
];
