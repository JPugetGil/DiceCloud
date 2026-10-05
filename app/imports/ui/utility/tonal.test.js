import { assert } from 'chai';
import tonalSurface, { toneOf, rgbToLch } from '/imports/ui/utility/tonal.mjs';
import { parseHex, contrastRatio } from '/imports/ui/utility/onColor.mjs';
import { userSurfaceProps } from '/imports/ui/utility/userColor';

/** @type {(hex: string) => number} */
const tone = hex => rgbToLch(/** @type {any} */ (parseHex(hex))).l;
/** @type {(hex: string, dark: boolean) => { background: string, text: string }} */
const surface = (hex, dark) => /** @type {any} */ (tonalSurface(hex, dark));

describe('A user colour as a large surface', function () {
  it('takes the colour\'s tone 40 in the light theme and 30 in the dark one', function () {
    assert.approximately(tone(surface('#03A9F4', false).background), 40, 0.6);
    assert.approximately(tone(surface('#03A9F4', true).background), 30, 0.6);
    assert.approximately(tone(/** @type {string} */ (toneOf('#1976D2', 90))), 90, 0.6);
  });

  it('keeps the hue: a blue stays blue', function () {
    const { r, g, b } = /** @type {any} */ (parseHex(surface('#1976D2', true).background));
    assert.isAbove(b, r);
    assert.isAbove(b, g);
  });

  it('puts its text at 4.5:1 or more, whatever the hue', function () {
    for (const hex of ['#FFEB3B', '#03A9F4', '#009688', '#F44336', '#212121', '#FAFAFA']) {
      for (const dark of [false, true]) {
        const { background, text } = surface(hex, dark);
        const ratio = contrastRatio(/** @type {any} */ (parseHex(text)), /** @type {any} */ (parseHex(background)));
        assert.isAtLeast(ratio, 4.5, `${hex} ${dark ? 'dark' : 'light'}`);
      }
    }
  });

  it('leaves a colour that is not hex to the theme', function () {
    assert.isUndefined(tonalSurface('primary', false));
    assert.deepEqual(userSurfaceProps('primary', true), { color: 'primary' });
    assert.deepEqual(userSurfaceProps(undefined, true), {});
  });
});
