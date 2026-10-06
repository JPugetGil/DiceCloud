import INLINE_CALCULATION_REGEX from '/imports/constants/INLINE_CALCULATION_REGEX';
import { parse } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';

/**
 * A spell's casting time, range or duration with its inline calculations
 * worked out: "{18 * (1 + spellSniper)} meters" -> "36 meters". These fields
 * are plain text in the schema, so the engine never computes them (unlike a
 * summary or a description, whose `.value` it stores). Same parser, same
 * scope (the character's variables, as the slot fill dialog evaluates its
 * conditions), plus `slotLevel` at the spell's own level, as when it is cast
 * without a higher slot; unknown variables count as zero, as everywhere.
 *
 * Never leaves braces: a calculation that does not parse shows its own text.
 * Numbers go through `formatNumber` (a French text wants "4,5", not "4.5").
 * @param {string | undefined} text
 * @param {Record<string, any>} scope
 * @param {Record<string, any>} [extraScope]
 * @param {{ formatNumber?: (number: number) => string }} [options]
 */
export default async function resolveInlineText(text, scope, extraScope, { formatNumber = String } = {}) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  const fullScope = { ...scope, ...extraScope };
  const calculations = [...text.matchAll(INLINE_CALCULATION_REGEX)].map(match => match[1]);
  const values = await Promise.all(calculations.map(
    calculation => resolveCalculation(calculation, fullScope, formatNumber)
  ));
  let index = 0;
  // A lone brace (unbalanced text) is not a calculation either: dropped
  return text.replace(INLINE_CALCULATION_REGEX, () => values[index++]).replace(/[{}]/g, '').trim();
}

async function resolveCalculation(calculation, scope, formatNumber) {
  try {
    const { result } = await resolve('reduce', parse(calculation), scope);
    if (result?.parseType === 'constant') {
      return typeof result.value === 'number' ? formatNumber(result.value) : String(result.value);
    }
    return toString(result);
  } catch {
    return calculation.trim();
  }
}

/** The extra scope of a spell's card: its level as the slot level */
export function spellScope(spell) {
  const slotLevel = Number.isFinite(spell?.level) ? spell.level : 0;
  return { slotLevel: { value: slotLevel }, '~slotLevel': { value: slotLevel } };
}
