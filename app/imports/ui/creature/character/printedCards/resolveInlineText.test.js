import { assert } from 'chai';
import resolveInlineText, { spellScope } from './resolveInlineText';

const french = new Intl.NumberFormat('fr', { maximumFractionDigits: 2 });

describe('Inline calculations in a spell card\'s plain text fields', function () {
  it('resolves them with the character\'s variables', async function () {
    const scope = { spellSniper: { value: 1 } };
    assert.equal(await resolveInlineText('{18 * (1 + spellSniper)} meters', scope), '36 meters');
  });

  it('counts an unknown variable as zero, as the engine does', async function () {
    assert.equal(await resolveInlineText('{18 * (1 + spellSniper)} m', {}), '18 m');
  });

  it('takes the spell\'s level as the slot level', async function () {
    const duration = 'up to {slotLevel < 3 ? "1 hour" : slotLevel < 5 ? "8 hours" : "24 hours"}';
    assert.equal(await resolveInlineText(duration, {}, spellScope({ level: 1 })), 'up to 1 hour');
    assert.equal(await resolveInlineText(duration, {}, spellScope({ level: 4 })), 'up to 8 hours');
    assert.equal(await resolveInlineText('{slotLevel} minute(s)', {}, spellScope({ level: 0 })), '0 minute(s)');
  });

  it('writes numbers the way the text\'s language does', async function () {
    const formatNumber = n => french.format(n);
    assert.equal(await resolveInlineText('{1.5 * 3} m', {}, {}, { formatNumber }), '4,5 m');
  });

  it('never leaves a brace, even when a calculation does not parse', async function () {
    assert.equal(await resolveInlineText('{1 +} feet', {}), '1 + feet');
    assert.equal(await resolveInlineText('Self {', {}), 'Self');
    assert.equal(await resolveInlineText('Touch', {}), 'Touch');
    assert.isUndefined(await resolveInlineText(undefined, {}));
  });
});
