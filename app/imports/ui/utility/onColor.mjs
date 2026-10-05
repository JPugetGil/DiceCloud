/**
 * The text colour for a background the user chose (a creature's or a
 * property's colour): black or white, whichever has the higher WCAG contrast
 * ratio with it. Over the 190 colours of the colour picker (Material's palette
 * without its accents) none falls below 4.5:1; Vuetify's own choice, by APCA,
 * which favours white, left 49 below it, and the YIQ brightness the app used
 * before left 19 (DESIGN_SYSTEM.md, rule 2).
 *
 * A plain ES module (.mjs) with no import, so that the browser checks
 * (tests/e2e/checks/palette.js) load the same function under Node.
 */
export const BLACK = '#000000';
export const WHITE = '#FFFFFF';

/** { r, g, b } from #RGB, #RRGGBB or #RRGGBBAA; undefined for anything else */
export function parseHex(hex) {
  if (typeof hex !== 'string') return undefined;
  let digits = hex.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(digits)) digits = digits.replace(/./g, digit => digit + digit);
  if (!/^[\da-f]{6}([\da-f]{2})?$/i.test(digits)) return undefined;
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** WCAG 2's relative luminance, 0 (black) to 1 (white) */
export function relativeLuminance({ r, g, b }) {
  const channel = value => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2's contrast ratio of two colours, 1 to 21 */
export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** BLACK or WHITE for text on `hex`; undefined when `hex` is not a hex colour */
export default function onColor(hex) {
  const background = parseHex(hex);
  if (!background) return undefined;
  const onBlack = contrastRatio(background, { r: 0, g: 0, b: 0 });
  const onWhite = contrastRatio(background, { r: 255, g: 255, b: 255 });
  return onWhite > onBlack ? WHITE : BLACK;
}
