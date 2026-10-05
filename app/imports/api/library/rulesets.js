/**
 * Rulesets: what a new character starts from, a library node that fills a
 * character's Ruleset slot (its slot tags are `base`). Offered as cards at
 * the first step of character creation (UX3).
 */
export const RULESET_TAG = 'base';

const FRENCH = /[éèêàâçùûôî]|\b(la|le|les|de|des|une|et|pour|avec|dans|du|au|aux|sur|vous)\b/gi;
const ENGLISH = /\b(the|and|of|to|with|for|your|every|is)\b/gi;

/**
 * The language a text is written in, 'fr' or 'en', guessed from its common
 * words and accents; undefined when it cannot tell. The fallback when a
 * library or collection has no language set (libraryLanguage.js)
 */
export function guessLanguage(text) {
  if (!text) return undefined;
  const french = text.match(FRENCH)?.length || 0;
  const english = text.match(ENGLISH)?.length || 0;
  if (french === english) return undefined;
  return french > english ? 'fr' : 'en';
}

// A collection's description as one line of plain text, for a card
export function plainSummary(text, length = 160) {
  if (!text) return '';
  const firstParagraph = text.split(/\n\s*\n/).find(part => part.trim()) || '';
  const plain = firstParagraph.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}

/**
 * The ruleset to start from: one in the interface's language, preferably one
 * the user follows already, then one the admins recommend; else one they
 * follow; else the first
 */
export function preferredRuleset(rulesets = [], locale) {
  const inLocale = rulesets.filter(ruleset => ruleset.language === locale);
  return inLocale.find(ruleset => ruleset.followed)
    || inLocale.find(ruleset => ruleset.recommended)
    || inLocale[0]
    || rulesets.find(ruleset => ruleset.followed)
    || rulesets[0];
}
