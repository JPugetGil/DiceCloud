import { assert } from 'chai';
import healthBarColors from '/imports/ui/properties/components/attributes/healthBarColors';
import isDarkColor from '/imports/ui/utility/isDarkColor';

// The light theme's (imports/ui/plugins/themes.js)
const theme = { primary: '#B91D1D', 'surface-light': '#E7E5E4' };

describe('Health bar colours', function () {
  it('a full bar is in its colour, on a darker track', function () {
    const { bar, track } = healthBarColors({ value: 10, total: 10, color: '#2E7D32' }, theme);
    assert.equal(bar, '#2E7D32');
    assert.isTrue(isDarkColor(track));
  });

  it('a bar below half takes its mid colour, mixed towards its low colour', function () {
    const model = { total: 10, healthBarColorMid: '#FFC107', healthBarColorLow: '#F44336' };
    assert.equal(healthBarColors({ ...model, value: 5 }, theme).bar, '#ffc107');
    assert.equal(healthBarColors({ ...model, value: 0 }, theme).bar, '#f44336');
    assert.equal(healthBarColors({ value: 2, total: 10, healthBarColorMid: '#FFC107' }, theme).bar, '#FFC107');
  });

  // The value, centred, is written on the track below half: it took white
  // text on the light theme's light grey
  it('a bar without a maximum has the theme\'s empty track, light in the light theme', function () {
    const { bar, track } = healthBarColors({ value: 0, total: 0 }, theme);
    assert.equal(bar, theme.primary);
    assert.equal(track, theme['surface-light']);
    assert.isFalse(isDarkColor(track));
  });
});
