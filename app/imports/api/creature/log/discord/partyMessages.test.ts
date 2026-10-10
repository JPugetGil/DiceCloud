import { assert } from 'chai';
import {
  THREAD_NAME_LENGTH, combatStart, combatSummary, escapeMarkdown, initiativeMessage, sessionHeader, sessionName,
  turnLine, type InitiativeRow,
} from '/imports/api/creature/log/discord/partyMessages';
import {
  PUBLISH_KINDS, postingKey, postingSummary, publishes,
} from '/imports/api/creature/log/discord/partyPublishing';
import { isDiscordWebhookURL, parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import { sessionOf } from '/imports/api/creature/log/discord/discordSession';

const rows: InitiativeRow[] = [
  { name: 'Aria', initiative: 18, character: true, conditions: [] },
  { name: 'Goblin 1', initiative: 15, conditions: ['Prone', 'Grappled'] },
  { name: 'Goblin 2', initiative: 12, out: true },
  { name: 'Borin', character: true },
];

describe('The party\'s Discord messages (partyMessages)', function () {
  it('shows the order, the round and whose turn it is, never a creature\'s health', function () {
    const message = initiativeMessage({ rows, round: 2, turn: 1, language: 'en' });
    const [embed] = message.embeds;
    assert.equal(embed.title, 'Combat — round 2');
    assert.deepEqual(embed.description.split('\n'), [
      '`18` Aria',
      '▶ **`15` Goblin 1** · *Prone, Grappled*',
      '~~`12` Goblin 2~~ (out of the fight)',
      '` –` Borin',
    ]);
    assert.deepEqual(message.allowed_mentions, { parse: [] });
    // Nothing that tells of hit points: the rows have none to give
    assert.notMatch(JSON.stringify(message), /hit points|hp|bloodied|unhurt|PV/i);
    const ended = initiativeMessage({ rows, round: 3, turn: 1, language: 'fr', ended: true });
    assert.equal(ended.embeds[0].title, 'Combat terminé — round 3');
    assert.notInclude(ended.embeds[0].description, '▶', 'no one has the turn any more');
    assert.include(ended.embeds[0].description, '(hors de combat)');
  });

  it('names whose turn it is in plain text: a character\'s, another creature\'s', function () {
    assert.deepEqual(turnLine(rows[0], 'fr'), { content: 'À toi : Aria', allowed_mentions: { parse: [] } });
    assert.equal(turnLine(rows[1], 'fr')?.content, 'Au tour de Goblin 1');
    assert.equal(turnLine(rows[0], 'en')?.content, 'Your turn: Aria');
    assert.equal(turnLine(rows[1], 'en')?.content, 'Goblin 1\'s turn');
    assert.isUndefined(turnLine(undefined));
    assert.equal(turnLine({ name: '*Star* _Lord_' }, 'en')?.content, '\\*Star\\* \\_Lord\\_\'s turn', 'a name as typed');
    assert.equal(combatStart('fr')?.content, '**Début du combat**');
  });

  it('sums the fight up: rounds, who fought, who was put out of it', function () {
    const [embed] = combatSummary({ rows, round: 4, language: 'fr', partyName: 'Les Héros' }).embeds;
    assert.equal(embed.title, 'Fin du combat — Les Héros');
    assert.deepEqual(embed.description.split('\n'), [
      'Rounds : 4',
      'Participants : Aria, Goblin 1, Goblin 2, Borin',
      'Hors de combat : Goblin 2',
    ]);
    assert.equal(combatSummary({ rows: rows.slice(0, 1), round: 1 }).embeds[0].title, 'End of combat');
  });

  it('names a session after its date, in the channel\'s language and the browser\'s time zone', function () {
    // 23:30 in Paris on October 10 is the 10th there, still the 10th in New York, the 11th in Tokyo
    const date = new Date('2026-10-10T21:30:00Z');
    assert.equal(sessionName({ label: 'Les Héros', date, language: 'fr', timeZone: 'Europe/Paris' }),
      'Séance du 10 octobre 2026 — Les Héros');
    assert.equal(sessionName({ label: 'The Heroes', date, language: 'en', timeZone: 'Asia/Tokyo' }),
      'Session of October 11, 2026 — The Heroes');
    assert.equal(sessionName({ date, language: 'en', timeZone: 'Not/AZone' }), 'Session of October 10, 2026');
    assert.lengthOf(sessionName({ label: 'x'.repeat(200), date }), THREAD_NAME_LENGTH);
    assert.equal(sessionHeader('Séance du 10 octobre', { username: 'Aria' }).content, '## Séance du 10 octobre');
    assert.equal(escapeMarkdown('#1 - [a](b)'), '\\#1 \\- \\[a\\](b)');
  });
});

describe('What a party publishes on Discord (partyPublishing)', function () {
  const webhook = 'https://discord.com/api/webhooks/1/abc';

  it('publishes every kind once a webhook is set, none with publishing off', function () {
    assert.isFalse(publishes(undefined));
    assert.isFalse(publishes({}, 'rolls'), 'no webhook');
    for (const kind of PUBLISH_KINDS) assert.isTrue(publishes({ webhook }, kind), kind);
    for (const kind of PUBLISH_KINDS) assert.isFalse(publishes({ webhook, enabled: false }, kind), kind);
    assert.isFalse(publishes({ webhook, publish: { turns: false } }, 'turns'));
    assert.isTrue(publishes({ webhook, publish: { turns: false } }, 'initiative'));
  });

  it('tells the players what goes to Discord, rolls or fights, never more', function () {
    assert.deepEqual(postingSummary({ webhook }), { rolls: true, combat: true });
    assert.deepEqual(postingSummary({ webhook, publish: { rolls: false } }), { combat: true });
    assert.deepEqual(postingSummary({ webhook, publish: { initiative: false, turns: false, combat: false } }), { rolls: true });
    assert.isUndefined(postingSummary({ webhook, publish: { rolls: false, initiative: false, turns: false, combat: false } }));
    assert.isUndefined(postingSummary({ webhook, enabled: false }));
    assert.notProperty(postingSummary({ webhook }) as object, 'webhook');
    assert.equal(postingKey({ rolls: true, combat: true }), 'discord.posting.rollsAndCombat');
    assert.equal(postingKey({ combat: true }), 'discord.posting.combat');
    assert.isUndefined(postingKey(undefined));
  });

  it('reads a webhook\'s URL, and takes only Discord\'s on the party board', function () {
    assert.deepEqual(parseWebhookURL('https://discord.com/api/webhooks/123/abc-DEF_9'), { id: '123', token: 'abc-DEF_9' });
    assert.isTrue(isDiscordWebhookURL('https://discord.com/api/webhooks/123/abc-DEF_9'));
    assert.isTrue(isDiscordWebhookURL('https://ptb.discord.com/api/v10/webhooks/123/abc/'));
    assert.isFalse(isDiscordWebhookURL('http://discord.com/api/webhooks/123/abc'));
    assert.isFalse(isDiscordWebhookURL('https://discord.com.evil.example/api/webhooks/123/abc'));
    assert.isFalse(isDiscordWebhookURL('https://discord.com/api/webhooks/e2e/abc'));
    const session = { webhookId: '123', kind: 'forum' as const, threadId: '9', startedAt: new Date() };
    assert.strictEqual(sessionOf(session, '123'), session);
    assert.isUndefined(sessionOf(session, '456'), 'a session of another webhook is over');
  });
});
