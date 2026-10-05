import { assert } from 'chai';
import {
  damageTypeMessage, englishMessage, logLine, logLineTone, msg, renderMessage, translateLogLine, withAdvantage,
} from '/imports/api/creature/log/logMessages';
import { logToMessageData } from '/imports/api/creature/log/CreatureLogs';

// A French reader, for a few keys: undefined for the others, as vue-i18n's te
const french = {
  'logs.criticalHit': 'Coup critique\u202f!',
  'logs.withAdvantage': '{name} (avantage)',
  'logs.damageAmount': '**{amount}** dégâts ({type})',
  'damageTypes.slashing': 'tranchant',
  'logs.shortRest': 'Repos court',
};
const translate = (key: string, params: Record<string, string | number>) => french[key]
  ?.replace(/\{(\w+)\}/g, (match: string, name: string) => String(params[name] ?? match));

describe('Log lines in the reader\'s language (logMessages)', function () {
  it('writes the English text from en.json', function () {
    assert.equal(englishMessage('logs.criticalHit'), 'Critical hit!');
    assert.equal(englishMessage('logs.dc', { dc: 15 }), 'DC **15**');
    assert.isUndefined(englishMessage('logs.noSuchKey'));
  });

  it('keeps the English text and adds the messages', function () {
    const line = logLine({
      name: withAdvantage(msg('logs.criticalHit'), 1),
      value: ['1d20 [20] +5', msg('logs.damageAmount', { amount: 12, type: damageTypeMessage('slashing') })],
      inline: true,
    });
    assert.equal(line.name, 'Critical hit! (Advantage)');
    assert.equal(line.value, '1d20 [20] +5\n**12** slashing damage');
    assert.isTrue(line.inline);
    assert.deepEqual(line.i18n?.name, {
      key: 'logs.withAdvantage', params: { name: { key: 'logs.criticalHit' } },
    });
    assert.equal(line.i18n?.value?.[0], '1d20 [20] +5');
  });

  it('leaves plain text without messages', function () {
    assert.deepEqual(logLine({ name: 'Longsword', value: '**3**' }), { name: 'Longsword', value: '**3**' });
  });

  it('translates a stored line when it is shown', function () {
    const line = logLine({
      name: withAdvantage(msg('logs.criticalHit'), 1),
      value: ['1d20 [20] +5', msg('logs.damageAmount', { amount: 12, type: damageTypeMessage('slashing') })],
    });
    const shown = translateLogLine(line, translate);
    assert.equal(shown.name, 'Coup critique\u202f! (avantage)');
    assert.equal(shown.value, '1d20 [20] +5\n**12** dégâts (tranchant)');
  });

  it('falls back to a custom damage type as typed, and to stored text for older logs', function () {
    assert.equal(renderMessage(damageTypeMessage('psionic'), translate), 'psionic');
    const old = { name: 'Short Rest', value: 'Nothing to restore' };
    assert.strictEqual(translateLogLine(old, translate), old);
  });

  it('tells criticals apart in any language', function () {
    assert.equal(logLineTone(logLine({ name: withAdvantage(msg('logs.criticalHit'), -1) })), 'success');
    assert.equal(logLineTone(logLine({ name: msg('logs.criticalMiss') })), 'error');
    assert.isUndefined(logLineTone(logLine({ name: msg('logs.hit') })));
    assert.equal(logLineTone({ name: 'Critical Hit!' }), 'success');
  });

  it('sends Discord the English name and value only', function () {
    const line = logLine({ name: msg('logs.shortRest'), value: msg('logs.nothingRestored'), inline: true });
    const { embeds: [embed] } = logToMessageData({ content: [line, { value: 'text' }] });
    assert.deepEqual(embed.fields, [
      { name: 'Short rest', value: 'Nothing to restore', inline: true },
      { name: '​', value: 'text' },
    ]);
  });
});
