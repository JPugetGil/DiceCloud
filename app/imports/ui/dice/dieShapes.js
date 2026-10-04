/**
 * The outline of each kind of die, in a 100 × 100 box: the shape the tray
 * draws, its facets, and where the number sits.
 */
const SHAPES = {
  4: {
    body: 'M50 6 L95 88 Q96 92 91 92 L9 92 Q4 92 5 88 Z',
    facets: ['M50 6 L50 62', 'M50 62 L7 90', 'M50 62 L93 90'],
    textY: 70,
    fontSize: 28,
  },
  6: {
    body: 'M18 8 H82 Q92 8 92 18 V82 Q92 92 82 92 H18 Q8 92 8 82 V18 Q8 8 18 8 Z',
    facets: [],
    textY: 52,
    fontSize: 40,
  },
  8: {
    body: 'M50 4 L94 50 L50 96 L6 50 Z',
    facets: ['M6 50 L94 50', 'M50 4 L30 50 L50 96', 'M50 4 L70 50 L50 96'],
    textY: 54,
    fontSize: 30,
  },
  10: {
    body: 'M50 4 L94 44 L50 96 L6 44 Z',
    facets: ['M6 44 L30 56 L50 96', 'M94 44 L70 56 L50 96', 'M30 56 L50 4 L70 56 Z'],
    textY: 46,
    fontSize: 24,
  },
  12: {
    body: 'M50 4 L94 36 L77 92 L23 92 L6 36 Z',
    facets: ['M50 22 L72 40 L64 70 L36 70 L28 40 Z', 'M50 4 L50 22', 'M94 36 L72 40', 'M77 92 L64 70', 'M23 92 L36 70', 'M6 36 L28 40'],
    textY: 51,
    fontSize: 24,
  },
  20: {
    body: 'M50 3 L93 27 L93 73 L50 97 L7 73 L7 27 Z',
    facets: ['M50 20 L78 68 L22 68 Z', 'M50 3 L50 20', 'M93 27 L50 20', 'M7 27 L50 20', 'M93 27 L78 68',
      'M93 73 L78 68', 'M50 97 L78 68', 'M50 97 L22 68', 'M7 73 L22 68', 'M7 27 L22 68'],
    textY: 53,
    fontSize: 27,
  },
  // Coins, d3s and anything else
  other: {
    body: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    facets: ['M50 16 A34 34 0 1 1 49.9 16 Z'],
    textY: 52,
    fontSize: 32,
  },
};

export default function dieShape(size) {
  // A d100 is drawn as the d10 it is rolled with
  if (size === 100) return SHAPES[10];
  return SHAPES[size] || SHAPES.other;
}
