import { assert } from 'chai';
import vuetifyColors from 'vuetify/util/colors';
import onColor, { BLACK, WHITE, parseHex, contrastRatio } from '/imports/ui/utility/onColor.mjs';
import isDarkColor from '/imports/ui/utility/isDarkColor';
import userColorProps from '/imports/ui/utility/userColor';

const SHADES = ['lighten5', 'lighten4', 'lighten3', 'lighten2', 'lighten1', 'base', 'darken1', 'darken2', 'darken3', 'darken4'];

describe('Text on a colour the user chose (onColor)', function () {
  it('reads hex colours, and nothing else', function () {
    assert.deepEqual(parseHex('#03A9F4'), { r: 3, g: 169, b: 244 });
    assert.deepEqual(parseHex('fff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(parseHex('#00968880'), { r: 0, g: 150, b: 136 });
    assert.isUndefined(parseHex('primary'));
    assert.isUndefined(parseHex('#12345'));
    assert.isUndefined(parseHex(undefined));
    assert.isUndefined(onColor('secondary'));
  });

  it('measures WCAG contrast ratios', function () {
    assert.closeTo(contrastRatio(parseHex(BLACK), parseHex(WHITE)), 21, 1e-9);
    assert.closeTo(contrastRatio(parseHex('#777'), parseHex('#777')), 1, 1e-9);
    // White on the Journal's light blue, as Vuetify painted it
    assert.closeTo(contrastRatio(parseHex(WHITE), parseHex('#03a9f4')), 2.63, 0.01);
  });

  it('takes the text with the higher ratio', function () {
    assert.equal(onColor('#03a9f4'), BLACK);
    assert.equal(onColor('#2196f3'), BLACK);
    assert.equal(onColor('#009688'), BLACK);
    assert.equal(onColor('#1976d2'), WHITE);
    assert.equal(onColor('#000'), WHITE);
    assert.equal(onColor('#FFF'), BLACK);
  });

  it('reaches 4.5:1 on all 190 colours of the colour picker\'s palette', function () {
    const hexes = Object.entries(vuetifyColors).filter(([name]) => name !== 'shades')
      .flatMap(([, shades]) => SHADES.map(shade => shades[shade]).filter(Boolean));
    assert.lengthOf(hexes, 190);
    const failing = hexes.filter(hex => contrastRatio(parseHex(onColor(hex)), parseHex(hex)) < 4.5);
    assert.deepEqual(failing, []);
  });

  it('decides isDarkColor and the props of a painted component alike', function () {
    assert.isTrue(isDarkColor('#1976d2'));
    assert.isFalse(isDarkColor('#03a9f4'));
    assert.isNull(isDarkColor('primary'));
    assert.deepEqual(userColorProps('#03a9f4'), { color: '#03a9f4', theme: 'light', style: { color: BLACK } });
    assert.deepEqual(userColorProps('#1976d2', 'bg-color'),
      { 'bg-color': '#1976d2', theme: 'dark', style: { color: WHITE } });
    assert.deepEqual(userColorProps(undefined), {});
    assert.deepEqual(userColorProps('primary'), { color: 'primary' });
  });
});
