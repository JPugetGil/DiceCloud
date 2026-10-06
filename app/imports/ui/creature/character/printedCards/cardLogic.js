/**
 * Pure logic of the printable spell and item cards (/print-cards/:id): paper
 * and grid geometry, which properties become cards, what an item card says,
 * and the two searches the layout runs with the page's own measurements
 * (font size, then cards needed). Nothing here touches the DOM or Meteor.
 */

/** A card, in millimetres: the size of a playing card */
export const CARD = Object.freeze({ width: 63, height: 88 });
export const COLUMNS = 3;
export const ROWS = 3;
export const CARDS_PER_SHEET = COLUMNS * ROWS;

/**
 * The papers, in millimetres, with the margins that centre a 3 x 3 grid of
 * cards: A4 210 x 297 (10.5 / 16.5), Letter 8.5 x 11 in (13.45 / 7.7)
 */
export const PAPERS = Object.freeze({
  a4: Object.freeze({ width: 210, height: 297 }),
  letter: Object.freeze({ width: 215.9, height: 279.4 }),
});

export function paperMargins(paper) {
  const { width, height } = PAPERS[paper] || PAPERS.a4;
  return {
    x: round2((width - COLUMNS * CARD.width) / 2),
    y: round2((height - ROWS * CARD.height) / 2),
  };
}

/** Letter where it is the norm (United States, Canada, Mexico, Philippines...), A4 elsewhere */
export function defaultPaper(language) {
  return /-(US|CA|MX|PH|CL|CO|VE|GT|CR|PA|DO|PR|SV|NI)$/i.test(language || '') ? 'letter' : 'a4';
}

/**
 * The crop marks of a sheet, in millimetres from its top left corner: short
 * lines in the margins, in line with the edges of the cards. Each mark is
 * { x1, y1, x2, y2 }; they stop `gap` short of the grid.
 */
export function cropMarks(paper, { length = 5, gap = 1 } = {}) {
  const { width, height } = PAPERS[paper] || PAPERS.a4;
  const margin = paperMargins(paper);
  const marks = [];
  const reach = (space) => Math.max(0, Math.min(length, space - gap - 0.5));
  for (let column = 0; column <= COLUMNS; column++) {
    const x = round2(margin.x + column * CARD.width);
    const top = margin.y - gap;
    const bottom = margin.y + ROWS * CARD.height + gap;
    marks.push({ x1: x, y1: round2(top - reach(margin.y)), x2: x, y2: round2(top) });
    marks.push({ x1: x, y1: round2(bottom), x2: x, y2: round2(bottom + reach(height - bottom + gap)) });
  }
  for (let row = 0; row <= ROWS; row++) {
    const y = round2(margin.y + row * CARD.height);
    const left = margin.x - gap;
    const right = margin.x + COLUMNS * CARD.width + gap;
    marks.push({ x1: round2(left - reach(margin.x)), y1: y, x2: round2(left), y2: y });
    marks.push({ x1: round2(right), y1: y, x2: round2(right + reach(width - right + gap)), y2: y });
  }
  return marks;
}

/** Cards, nine to a sheet */
export function toSheets(cards) {
  const sheets = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) {
    sheets.push(cards.slice(i, i + CARDS_PER_SHEET));
  }
  return sheets;
}

/**
 * The largest size in [min, max], on the grid of `step`, for which `fits`
 * holds, or undefined when even `min` does not fit. `fits` must be monotonic
 * (true for every size below one that fits): a binary search, so a card is
 * measured about log2((max - min) / step) times.
 */
export function fitFontSize({ min, max, step, fits }) {
  const steps = Math.round((max - min) / step);
  const size = i => round2(min + i * step);
  if (!fits(size(0))) return undefined;
  let low = 0;
  let high = steps;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(size(middle))) low = middle;
    else high = middle - 1;
  }
  return size(low);
}

/**
 * Splits `total` atoms (words, table rows...) over cards: each card takes the
 * longest run from where the previous one stopped for which
 * `fits(cardIndex, start, end)` holds, found by binary search. A card always
 * takes at least one atom, so an atom too large for any card still gets one
 * (cut off) rather than looping. Returns [start, end) pairs, one per card.
 */
export function paginate(total, fits, { maxCards = 50 } = {}) {
  const ranges = [];
  let start = 0;
  while (start < total && ranges.length < maxCards) {
    const card = ranges.length;
    let low = start + 1;
    let high = total;
    if (!fits(card, start, low)) {
      ranges.push([start, low]);
      start = low;
      continue;
    }
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(card, start, middle)) low = middle;
      else high = middle - 1;
    }
    ranges.push([start, low]);
    start = low;
  }
  if (start < total && ranges.length) ranges[ranges.length - 1][1] = total;
  return ranges;
}

/**
 * The nearest ancestor among `candidates` (same tree, nested sets): the spell
 * list a spell belongs to, the container an item is in
 */
export function nearestAncestor(doc, candidates) {
  let nearest;
  for (const candidate of candidates || []) {
    if (candidate._id === doc._id) continue;
    if (candidate.left < doc.left && candidate.right > doc.right
      && (!nearest || candidate.left > nearest.left)) {
      nearest = candidate;
    }
  }
  return nearest;
}

const isDescendantOf = (doc, ancestor) => ancestor.left < doc.left && ancestor.right > doc.right;

/**
 * Which spells become cards:
 *   prepared (default)  prepared, always prepared and cantrips
 *   all                 every spell
 *   none                no spell
 * `listId` keeps only the spells of that spell list. Spells under an
 * unequipped item or an inactive toggle never print.
 * @param {any[]} spells
 * @param {{ mode?: string, listId?: string, lists?: any[] }} [options]
 */
export function selectSpells(spells, { mode = 'prepared', listId, lists = [] } = {}) {
  if (mode === 'none') return [];
  const list = listId && lists.find(l => l._id === listId);
  return (spells || []).filter(spell => {
    if (spell.removed || spell.deactivatedByAncestor || spell.deactivatedByToggle) return false;
    if (listId && (!list || !isDescendantOf(spell, list))) return false;
    if (mode === 'all') return true;
    return !!spell.prepared || !!spell.alwaysPrepared || spell.level === 0;
  });
}

/**
 * Which items become cards:
 *   equipped (default)  equipped items
 *   carried             items not in a container left behind
 *   all                 every item
 *   none                no item
 * `containerId` keeps only the items inside that container.
 * @param {any[]} items
 * @param {any[]} containers
 * @param {{ mode?: string, containerId?: string }} [options]
 */
export function selectItems(items, containers, { mode = 'equipped', containerId } = {}) {
  if (mode === 'none') return [];
  const container = containerId && (containers || []).find(c => c._id === containerId);
  return (items || []).filter(item => {
    if (item.removed || item.deactivatedByAncestor || item.deactivatedByToggle) return false;
    if (containerId && (!container || !isDescendantOf(item, container))) return false;
    if (mode === 'equipped') return !!item.equipped;
    if (mode === 'carried') {
      return !(containers || []).some(c => c.carried === false && isDescendantOf(item, c));
    }
    return true;
  });
}

// Rarity is not a field: the libraries tag their magic items in English
const RARITIES = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'];
const RARITY_TAGS = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  'very rare': 'veryRare',
  veryrare: 'veryRare',
  legendary: 'legendary',
  artifact: 'artifact',
  artefact: 'artifact',
};

/** The rarest rarity among an item's tags, or undefined */
export function itemRarity(tags) {
  let rarest;
  for (const tag of tags || []) {
    const rarity = RARITY_TAGS[String(tag).trim().toLowerCase()];
    if (rarity && (!rarest || RARITIES.indexOf(rarity) > RARITIES.indexOf(rarest))) rarest = rarity;
  }
  return rarest;
}

/**
 * An item's charges, from its descendants: an attribute of type `resource`
 * (a wand's 7 charges: value left of total), else an action with uses. The
 * first one in tree order counts. Returns { left, max } or undefined.
 */
export function itemCharges(item, descendants) {
  const inside = (descendants || [])
    .filter(doc => !doc.removed && isDescendantOf(doc, item))
    .sort((a, b) => a.left - b.left);
  const resource = inside.find(doc => doc.type === 'attribute' && doc.attributeType === 'resource'
    && Number.isFinite(doc.total) && doc.total > 0);
  if (resource) {
    return { left: Number.isFinite(resource.value) ? resource.value : resource.total, max: resource.total };
  }
  const action = inside.find(doc => doc.type === 'action' && Number.isFinite(doc.uses?.value) && doc.uses.value > 0);
  if (action) {
    const left = Number.isFinite(action.usesLeft) ? action.usesLeft : action.uses.value - (action.usesUsed || 0);
    return { left, max: action.uses.value, reset: action.reset };
  }
  return undefined;
}

/** A spell's uses, when it has some: { left, max, reset } */
export function spellUses(spell) {
  const max = spell?.uses?.value;
  if (!Number.isFinite(max) || max <= 0) return undefined;
  const left = Number.isFinite(spell.usesLeft) ? spell.usesLeft : max - (spell.usesUsed || 0);
  return { left, max, reset: spell.reset };
}

/** Its letters (V, S, M), for the components line */
export function componentCodes(spell) {
  return [spell.verbal && 'V', spell.somatic && 'S', spell.material && 'M'].filter(Boolean);
}

/** "action" -> "Action": upstream values are often lower case */
export function capitalizeFirst(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function round2(number) {
  return Math.round(number * 100) / 100;
}

// An item's kind, for its icon: the first of these its tags name
/** @type {[string, string[]][]} */
const ITEM_KINDS = [
  ['wand', ['wand']],
  ['staff', ['staff']],
  ['rod', ['rod']],
  ['ring', ['ring']],
  ['potion', ['potion', 'poison']],
  ['scroll', ['scroll', 'spell scroll']],
  ['shield', ['shield']],
  ['armor', ['armor', 'light armor', 'medium armor', 'heavy armor', 'barding']],
  ['ammunition', ['ammunition']],
  ['weapon', ['weapon', 'melee weapon', 'ranged weapon', 'simple weapon', 'martial weapon']],
  ['wondrous', ['wondrous item']],
  ['tool', ['artisans tools', 'artisantool', 'musictool', 'instrument', 'thieverytool', 'tool']],
];

/** 'wand', 'armor', 'weapon'... or 'gear' when the tags say nothing */
export function itemKind(tags) {
  const lower = new Set((tags || []).map(tag => String(tag).trim().toLowerCase()));
  return ITEM_KINDS.find(([, names]) => names.some(name => lower.has(name)))?.[0] || 'gear';
}

/**
 * Places cards on sheets of COLUMNS x ROWS cells: a card spans 1 cell, a
 * double card 2 side by side in one row. First fit, cell by cell: a single
 * card fills a hole a double card left at the end of a row. Returns
 * [{ cells: [{ card, row, col, span }] }], one per sheet.
 */
export function packCards(cards, { columns = COLUMNS, rows = ROWS } = {}) {
  const sheets = [];
  const fits = (grid, row, col, span) => col + span <= columns
    && grid[row].slice(col, col + span).every(cell => !cell);
  for (const card of cards) {
    const span = card.span === 2 && columns >= 2 ? 2 : 1;
    let placed = false;
    for (const sheet of sheets) {
      for (let row = 0; row < rows && !placed; row++) {
        for (let col = 0; col < columns && !placed; col++) {
          if (fits(sheet.grid, row, col, span)) {
            for (let c = col; c < col + span; c++) sheet.grid[row][c] = true;
            sheet.cells.push({ card, row, col, span });
            placed = true;
          }
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const grid = Array.from({ length: rows }, () => Array(columns).fill(false));
      for (let c = 0; c < span; c++) grid[0][c] = true;
      sheets.push({ grid, cells: [{ card, row: 0, col: 0, span }] });
    }
  }
  return sheets.map(({ cells }) => ({ cells }));
}

/**
 * Where a card's back goes on the back of the sheet, printed on both sides
 * and turned over its long edge: same row, columns mirrored
 */
export function mirrorPlacement({ row, col, span = 1 }, { columns = COLUMNS } = {}) {
  return { row, col: columns - col - span, span };
}

/**
 * The colour of a card: its spell list's, else the character's; an item's,
 * the character's. Undefined (no colour) when none is a hex colour.
 */
/** @param {{ list?: { color?: string }, creature?: { color?: string } }} [owners] */
export function cardColor({ list, creature } = {}) {
  const hex = color => typeof color === 'string' && /^#([0-9a-f]{3}){1,2}$/i.test(color) ? color : undefined;
  return hex(list?.color) || hex(creature?.color);
}
