/**
 * Pure logic of the official-looking printed sheet (?layout=official): its
 * pages and their running headers, and how the character's properties are
 * grouped on them. Nothing here touches the DOM or Meteor.
 */

export const PAGE_SIZES = Object.freeze({
  a4: Object.freeze({ width: 210, height: 297, css: 'A4' }),
  letter: Object.freeze({ width: 215.9, height: 279.4, css: 'letter' }),
});

/** The sheet's fixed grid, in mm: the same on A4 and Letter */
export const CONTENT = Object.freeze({ width: 186, height: 250 });

/**
 * Page margins (mm) that centre the content box on the paper, with room at
 * the top for the running header
 */
export function pageMargins(paper) {
  const { width, height } = PAGE_SIZES[paper] || PAGE_SIZES.a4;
  const side = Math.round(((width - CONTENT.width) / 2) * 100) / 100;
  const vertical = height - CONTENT.height;
  const top = Math.min(16, Math.round(vertical * 0.55 * 100) / 100);
  const bottom = Math.round((vertical - top) * 100) / 100;
  return { top, right: side, bottom, left: side };
}

/** A CSS string literal of any text: quotes, backslashes and newlines escaped */
export function cssString(text) {
  return `"${String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
}

/**
 * The @page rules of the sheet's named pages: their size and margins, and a
 * running header (Chrome 131+ draws page-margin boxes; elsewhere the pages
 * simply have none, their own titles still say what they are)
 */
export function pageRules({ paper, pages, headerRight, footer }) {
  const { css } = PAGE_SIZES[paper] || PAGE_SIZES.a4;
  const m = pageMargins(paper);
  const font = 'font-family: Roboto, sans-serif; font-size: 7pt; color: #444;';
  return pages.map(({ name, title }) => `@page ${name} {
  size: ${css} portrait;
  margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  @top-left { content: ${cssString(title)}; ${font} vertical-align: bottom; padding-bottom: 2mm; }
  @top-right { content: ${cssString(headerRight)}; ${font} vertical-align: bottom; padding-bottom: 2mm; }
  @bottom-right { content: ${cssString(footer)} counter(page); ${font} vertical-align: top; padding-top: 2mm; }
}`).join('\n');
}

/**
 * The mark of a proficiency on the sheet: none, half, proficient or expert
 * (DiceCloud's proficiency is 0, 0.49, 0.5, 1 or 2 times the bonus)
 */
export function proficiencyMark(proficiency) {
  if (!proficiency) return 'none';
  if (proficiency >= 2) return 'expertise';
  if (proficiency >= 1) return 'proficient';
  return 'half';
}

/**
 * Spells by level, 0 to 9, with the slots of each level: only the levels
 * that have a spell or a slot. Spells sorted by name in `locale`.
 */
export function spellsByLevel(spells, slots, locale) {
  const levels = [];
  for (let level = 0; level <= 9; level++) {
    const ofLevel = (spells || []).filter(spell => (spell.level || 0) === level)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', locale));
    const slotTotal = (slots || [])
      .filter(slot => slot.spellSlotLevel?.value === level)
      .reduce((sum, slot) => sum + (Number.isFinite(slot.total) ? slot.total : 0), 0);
    if (ofLevel.length || slotTotal) levels.push({ level, spells: ofLevel, slots: slotTotal });
  }
  return levels;
}

/** A modifier as it is printed: +3, −1 (minus sign), 0 as +0 */
export function signed(number) {
  if (!Number.isFinite(number)) return '';
  return number < 0 ? `\u2212${Math.abs(number)}` : `+${number}`;
}

/** The first damage of an attack, as "1d6 + 3 bludgeoning" */
export function damageText(damages, damageTypeName = type => type) {
  const damage = (damages || []).find(d => d.amount && (d.amount.value !== undefined && d.amount.value !== 0));
  if (!damage) return '';
  const amount = typeof damage.amount.value === 'string'
    ? damage.amount.value.replace(/\s*([+-])\s*/g, ' $1 ').trim()
    : String(damage.amount.value);
  const type = damage.damageType ? damageTypeName(damage.damageType) : '';
  return [amount, type].filter(Boolean).join(' ');
}
