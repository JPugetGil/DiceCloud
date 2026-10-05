/**
 * A user's colour as a large surface (D2): the tone of its hue that Material
 * gives a filled surface, rather than the colour itself, which in the dark
 * theme made a character's bar the brightest thing on the screen. Tone 40
 * under white text in the light theme, tone 30 under tone 90 text in the dark
 * one, as Material's tonal palettes have it.
 *
 * Tone is CIELAB's L*, as in Material's HCT; the hue and chroma are LCh's,
 * close to HCT's, with the chroma cut down to stay within sRGB. A tone fixes
 * the luminance, so the contrast does not depend on the hue: tone 40 under
 * white is 6.5:1, tone 90 over tone 30 7.2:1 (DESIGN_SYSTEM.md, rule 2).
 *
 * A plain ES module with no import, which the browser checks
 * (tests/e2e/checks/palette.js) load under Node, as onColor.mjs.
 */
import { parseHex } from './onColor.mjs';

const WHITE_POINT = [0.95047, 1, 1.08883];

const toLinear = value => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = value => {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return v * 255;
};

const labF = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
const labFInverse = t => t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);

/** { l, c, h } (CIELAB LCh, D65) of an { r, g, b } colour */
export function rgbToLch({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / WHITE_POINT[0];
  const y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / WHITE_POINT[1];
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / WHITE_POINT[2];
  const [fx, fy, fz] = [x, y, z].map(labF);
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return { l, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

// The linear sRGB of an LCh colour, unclipped
function lchToLinear({ l, c, h }) {
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const fy = (l + 16) / 116;
  const x = labFInverse(fy + a / 500) * WHITE_POINT[0];
  const y = labFInverse(fy) * WHITE_POINT[1];
  const z = labFInverse(fy - b / 200) * WHITE_POINT[2];
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ];
}

const inGamut = linear => linear.every(v => v >= -1e-6 && v <= 1 + 1e-6);
const hex2 = value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');

/**
 * `hex` at `tone` (0 black to 100 white), its hue kept, as much of its chroma
 * as sRGB allows at that tone; undefined for a colour that is not hex
 */
export function toneOf(hex, tone) {
  const rgb = parseHex(hex);
  if (!rgb) return undefined;
  const { c, h } = rgbToLch(rgb);
  let low = 0;
  let high = c;
  // The largest chroma within sRGB, found by halving
  if (!inGamut(lchToLinear({ l: tone, c: high, h }))) {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(lchToLinear({ l: tone, c: mid, h }))) low = mid;
      else high = mid;
    }
    high = low;
  }
  const linear = lchToLinear({ l: tone, c: high, h });
  return `#${linear.map(v => hex2(fromLinear(Math.min(1, Math.max(0, v))))).join('').toUpperCase()}`;
}

/**
 * The background and text colours of a large surface the user coloured (a
 * character's bar, a card's header, a note), in the light or the dark theme;
 * undefined for a colour that is not hex
 */
export default function tonalSurface(hex, dark) {
  const background = toneOf(hex, dark ? 30 : 40);
  if (!background) return undefined;
  return { background, text: dark ? toneOf(hex, 90) : '#FFFFFF' };
}
