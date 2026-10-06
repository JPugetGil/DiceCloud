import { guessLanguage } from '/imports/api/library/rulesets';

/*
 * The language a library or a collection is written in (UX13): the field its
 * owner sets, else a guess from its name and description. Libraries made
 * before the field have none: the guess keeps them sorted until someone sets it
 * (there is no migration framework, see DESIGN_SYSTEM.md and the PO's notes).
 */
export const LIBRARY_LANGUAGES = Object.freeze(['en', 'fr']);

/** 'en', 'fr', or undefined when neither the field nor the text tell */
export default function libraryLanguage(doc) {
  if (!doc) return undefined;
  if (LIBRARY_LANGUAGES.includes(doc.language)) return doc.language;
  return guessLanguage([doc.name, doc.description].filter(Boolean).join('\n'));
}

/**
 * Whether a library or collection shows under a language filter: 'all', or a
 * language it is in. One whose language cannot be told shows under every one
 */
export function matchesLanguage(doc, filter) {
  if (!filter || filter === 'all') return true;
  const language = libraryLanguage(doc);
  return !language || language === filter;
}

/**
 * The language each library node is written in, from its library's
 * (`libraries` by id): for the printed cards, whose words then break by the
 * text's own rules (hyphens), whatever the interface's language
 */
export function nodeLanguages(nodes, librariesById) {
  const languages = {};
  for (const node of nodes || []) {
    const language = libraryLanguage(librariesById.get?.(node.root?.id) ?? librariesById[node.root?.id]);
    if (language) languages[node._id] = language;
  }
  return languages;
}
