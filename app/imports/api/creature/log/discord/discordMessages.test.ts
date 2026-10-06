import { assert } from 'chai';
import {
  CRITICAL_HIT_COLOR, CRITICAL_MISS_COLOR, DISCORD_LIMITS, colorNumber, discordLanguage, discordMessages,
  entryTone, truncate, visibleLines, webhookUsername, type WebhookMessage,
} from '/imports/api/creature/log/discord/discordMessages';
import { damageTypeMessage, logLine, msg } from '/imports/api/creature/log/logMessages';

const creature = { name: 'Aria', color: '#1976d2', avatarPicture: 'https://example.com/aria.png' };
const sheetUrl = 'https://dicecloud.example/character/abc123';
const date = new Date('2026-10-06T12:00:00Z');

// An attack as the engine logs it (applyActionProperty, applyDamageProperty)
function attack(hit: 'logs.hit' | 'logs.criticalHit' | 'logs.criticalMiss', die: number, { silentNote = false } = {}) {
  return {
    date,
    content: [
      { name: 'Longsword', value: 'A trusty blade' },
      logLine({ name: msg(hit), value: `1d20 [${die}] +5\n**${die + 5}**`, inline: true }),
      logLine({
        name: msg('logs.damage'),
        value: ['1d8 [6] +3', msg('logs.damageAmount', { amount: 9, type: damageTypeMessage('slashing') })],
        inline: true,
      }),
      ...silentNote ? [{ name: 'GM secret', value: 'The blade is cursed', silenced: true }] : [],
    ],
  };
}

// A roll typed in the log, as logRoll writes it
const typedRoll = (die: number) => ({
  date,
  content: [
    { value: '1d20 + 5' },
    { value: 'd20 + 5' },
    { value: `1d20 [${die}] + 5` },
    { value: String(die + 5) },
  ],
});

const allText = (messages: WebhookMessage[]) => JSON.stringify(messages);
const totalSize = (message: WebhookMessage) => message.embeds.reduce((sum, embed) => sum
  + (embed.title?.length || 0) + (embed.description?.length || 0)
  + embed.fields.reduce((fields, field) => fields + field.name.length + field.value.length, 0), 0);

describe('Discord messages of a log entry (discordMessages)', function () {
  it('leaves hidden (silenced) lines out', function () {
    const log = attack('logs.hit', 12, { silentNote: true });
    assert.lengthOf(visibleLines(log.content), 3);
    const text = allText(discordMessages({ log, creature, sheetUrl }));
    assert.notInclude(text, 'GM secret');
    assert.notInclude(text, 'cursed');
  });

  it('sends nothing when every line is hidden', function () {
    const log = { content: [{ name: 'Secret', value: 'Hidden', silenced: true }] };
    assert.deepEqual(discordMessages({ log, creature, sheetUrl }), []);
  });

  it('titles the embed with the action, links the sheet, puts each result first', function () {
    const [message] = discordMessages({ log: attack('logs.hit', 12), creature, sheetUrl });
    assert.deepEqual(message, {
      username: 'Aria',
      avatar_url: 'https://example.com/aria.png',
      embeds: [{
        title: 'Longsword',
        url: sheetUrl,
        description: 'A trusty blade',
        color: 0x1976d2,
        timestamp: '2026-10-06T12:00:00.000Z',
        fields: [
          { name: 'Hit!', value: '**17**\n1d20 [12] +5', inline: true },
          { name: 'Damage', value: '**9** slashing damage\n1d8 [6] +3', inline: true },
        ],
      }],
      allowed_mentions: { parse: [] },
    });
  });

  it('colours a critical hit and a critical miss apart from the character', function () {
    const color = (log: any) => discordMessages({ log, creature, sheetUrl })[0].embeds[0].color;
    assert.equal(color(attack('logs.criticalHit', 20)), CRITICAL_HIT_COLOR);
    assert.equal(color(attack('logs.criticalMiss', 1)), CRITICAL_MISS_COLOR);
    assert.equal(color(attack('logs.hit', 12)), 0x1976d2);
    assert.notEqual(CRITICAL_HIT_COLOR, CRITICAL_MISS_COLOR);
    // A natural 20 or 1 on a single d20, typed or checked; dropped dice don't count
    assert.equal(color(typedRoll(20)), CRITICAL_HIT_COLOR);
    assert.equal(color(typedRoll(1)), CRITICAL_MISS_COLOR);
    assert.equal(color(typedRoll(11)), 0x1976d2);
    assert.equal(entryTone([{ name: 'Roll', value: '1d20 [ 20, ~~3~~ ] +2\n**22**' }]), 'success');
    assert.isUndefined(entryTone([{ value: '2d20 [20, 1]' }]));
    // No colour of its own: Discord's default
    assert.notProperty(discordMessages({ log: typedRoll(11), creature: { name: 'Aria' }, sheetUrl })[0].embeds[0], 'color');
  });

  it('titles a typed roll with the roll, and gives its result and dice', function () {
    const [message] = discordMessages({ log: typedRoll(11), creature, sheetUrl });
    const [embed] = message.embeds;
    assert.equal(embed.title, 'Roll: 1d20 + 5');
    assert.equal(embed.description, '**16**\n1d20 [11] + 5');
    assert.deepEqual(embed.fields, []);
  });

  it('writes in the language of the character\'s owner, English otherwise', function () {
    const [french] = discordMessages({ log: attack('logs.criticalHit', 20), creature, sheetUrl, language: 'fr' });
    assert.equal(french.embeds[0].fields[0].name, 'Coup critique !');
    assert.equal(french.embeds[0].fields[1].value, '**9** dégâts (tranchant)\n1d8 [6] +3');
    const [typed] = discordMessages({ log: typedRoll(11), creature, sheetUrl, language: 'fr' });
    assert.equal(typed.embeds[0].title, 'Jet : 1d20 + 5');
    const [unknown] = discordMessages({ log: attack('logs.criticalHit', 20), creature, sheetUrl, language: 'de' });
    assert.equal(unknown.embeds[0].fields[0].name, 'Critical hit!');
    assert.equal(discordLanguage(undefined), 'en');
    // Text typed by users and older logs stay as they are
    const [old] = discordMessages({ log: { content: [{ name: 'Short Rest', value: 'Nothing' }] }, creature, language: 'fr' });
    assert.equal(old.embeds[0].title, 'Short Rest');
  });

  it('cuts names and values to Discord\'s limits', function () {
    const log = { content: [{ name: 'Fireball' }, { name: 'N'.repeat(300), value: 'V'.repeat(2000) }] };
    const [{ embeds: [embed] }] = discordMessages({ log, creature, sheetUrl });
    assert.lengthOf(embed.fields[0].name, DISCORD_LIMITS.fieldName);
    assert.lengthOf(embed.fields[0].value, DISCORD_LIMITS.fieldValue);
    assert.isTrue(embed.fields[0].value.endsWith('…'));
    assert.equal(truncate('ab😀cd', 4), 'ab…', 'never half an emoji');
    const [{ embeds: [long] }] = discordMessages({ log: { content: [{ name: 'T'.repeat(400), value: 'D'.repeat(5000) }] }, creature });
    assert.lengthOf(long.title as string, DISCORD_LIMITS.title);
    assert.lengthOf(long.description as string, DISCORD_LIMITS.description);
  });

  it('spreads a long entry over embeds and messages, within Discord\'s limits', function () {
    // The log keeps at most 32 lines (STORAGE_LIMITS.logContentCount)
    const content = [{ name: 'Wish' }, ...Array.from({ length: 31 }, (_, i) => ({ name: `Line ${i}`, value: 'x'.repeat(900) }))];
    const messages = discordMessages({ log: { content }, creature, sheetUrl });
    assert.isAbove(messages.length, 1);
    for (const message of messages) {
      assert.isAtMost(message.embeds.length, DISCORD_LIMITS.embedsPerMessage);
      assert.isAtMost(totalSize(message), DISCORD_LIMITS.charactersPerMessage);
      for (const embed of message.embeds) assert.isAtMost(embed.fields.length, DISCORD_LIMITS.fieldsPerEmbed);
      assert.equal(message.username, 'Aria');
    }
    const names = messages.flatMap(message => message.embeds.flatMap(embed => embed.fields.map(field => field.name)));
    assert.deepEqual(names, content.slice(1).map(line => line.name), 'every line, once, in order');
    assert.equal(messages[0].embeds[0].title, 'Wish');
    assert.notProperty(messages[1].embeds[0], 'title');
    assert.equal(messages[1].embeds[0].color, 0x1976d2);

    // Many short lines: 25 fields per embed
    const short = [{ name: 'Volley' }, ...Array.from({ length: 31 }, (_, i) => ({ name: `Arrow ${i}`, value: '1' }))];
    const [message] = discordMessages({ log: { content: short }, creature });
    assert.deepEqual(message.embeds.map(embed => embed.fields.length), [25, 6]);
  });

  it('posts under the character\'s name and picture only when Discord takes them', function () {
    assert.equal(webhookUsername('  Aria '), 'Aria');
    assert.isUndefined(webhookUsername('Discord Dan'), 'Discord refuses "discord" in a webhook name');
    assert.isUndefined(webhookUsername(''));
    assert.lengthOf(webhookUsername('A'.repeat(100)) as string, DISCORD_LIMITS.username);
    const [message] = discordMessages({
      log: typedRoll(11), creature: { name: 'Clyde', avatarPicture: '/cdn/avatar.png' }, sheetUrl: 'not a url',
    });
    assert.notProperty(message, 'username');
    assert.notProperty(message, 'avatar_url');
    assert.notProperty(message.embeds[0], 'url');
    assert.deepEqual(message.allowed_mentions, { parse: [] });
  });

  it('reads a character\'s colour', function () {
    assert.equal(colorNumber('#1976d2'), 0x1976d2);
    assert.equal(colorNumber('#A23'), 0xAA2233);
    assert.isUndefined(colorNumber('red'));
    assert.isUndefined(colorNumber(undefined));
  });
});
