/**
 * The first sentence of a markdown text, as plain text, for a one-line
 * preview: formatting, links and images dropped, inline calculations
 * (`{strength.modifier}`) left out, cut at `maxLength` characters.
 */
export default function firstSentence(markdown, maxLength = 160) {
  if (!markdown) return '';
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{[^}]*\}/g, '…')
    .replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = plain.match(/^.*?[.!?](?=\s|$)/)?.[0] || plain;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trimEnd()}…` : sentence;
}
