/**
 * Suggestions in formula fields: the variable or function name being typed at
 * the caret, and what replaces it once a suggestion is picked.
 */

export type FormulaSuggestion = {
  // What is inserted: a variable name, or a function name and its parenthesis
  insert: string,
  label: string,
  detail?: string,
  kind: 'variable' | 'function',
};

export type WordRange = { start: number, end: number, word: string };

// A name as the parser reads it: a letter or underscore, then letters, digits
// and underscores
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

/**
 * The name the caret is in or right after, undefined where no suggestion
 * applies: not on a name, after a dot (a property of a variable, such as
 * strength.modifier), inside a string or after a digit (2d6).
 */
export function getWordAtCaret(text: string, caret: number): WordRange | undefined {
  if (!text || caret < 0 || caret > text.length) return undefined;
  let start = caret;
  while (start > 0 && NAME_CHAR.test(text[start - 1])) start -= 1;
  let end = caret;
  while (end < text.length && NAME_CHAR.test(text[end])) end += 1;
  const word = text.slice(start, end);
  if (!word || !NAME_START.test(word[0])) return undefined;
  if (start > 0 && text[start - 1] === '.') return undefined;
  const before = text.slice(0, start);
  const quotes = (before.match(/'/g)?.length || 0) + (before.match(/"/g)?.length || 0);
  if (quotes % 2 === 1) return undefined;
  return { start, end, word };
}

/**
 * The suggestions matching the word, best first: names starting with it, then
 * names containing it, shortest first, case aside. A name already typed in
 * full suggests nothing.
 */
export function rankSuggestions(
  suggestions: FormulaSuggestion[], word: string, limit = 8
): FormulaSuggestion[] {
  const query = word.toLowerCase();
  if (!query) return [];
  const scored: { suggestion: FormulaSuggestion, score: number }[] = [];
  for (const suggestion of suggestions) {
    const name = suggestion.label.toLowerCase();
    if (name === query) return [];
    const index = name.indexOf(query);
    if (index === -1) continue;
    scored.push({ suggestion, score: (index === 0 ? 0 : 1000) + name.length });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.suggestion.label.localeCompare(b.suggestion.label))
    .slice(0, limit)
    .map(({ suggestion }) => suggestion);
}

/** The text with the word replaced by the suggestion, and where the caret goes */
export function applySuggestion(
  text: string, range: WordRange, suggestion: FormulaSuggestion
): { text: string, caret: number } {
  let insert = suggestion.insert;
  let after = text.slice(range.end);
  // A function already followed by its parenthesis keeps the one there
  if (suggestion.kind === 'function' && insert.endsWith('(') && after.startsWith('(')) {
    insert = insert.slice(0, -1);
    after = after.slice(1);
    return { text: text.slice(0, range.start) + insert + '(' + after, caret: range.start + insert.length + 1 };
  }
  return { text: text.slice(0, range.start) + insert + after, caret: range.start + insert.length };
}
