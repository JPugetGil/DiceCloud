import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs, { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import { logLine, msg } from '/imports/api/creature/log/logMessages';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { initiativeIntakeIdle } from '/imports/api/creature/log/server/discordInitiative';
import {
  rollInitiative, advanceInitiative, endInitiative, addInitiativeEntry, setInitiativeEntryOut,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import {
  setPartyWebhook, setPartyPublishing, startPartySession, endPartySession,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';
import {
  startCharacterSession, endCharacterSession, characterPartyWebhook,
} from '/imports/api/creature/creatures/methods/discordSessionMethods';
import { PUBLISH_KINDS } from '/imports/api/creature/log/discord/partyPublishing';
import { fakeDiscord, type FakeDiscord, type FakeRequest } from '/imports/api/creature/log/server/fakeDiscord.testFn';

/*
 * A party's Discord channel (D2) and the sessions (D3), against the local
 * fake of Discord: where a party character's roll goes, once per webhook;
 * what the game master's switches let through; the initiative message posted,
 * edited and closed; never a monster's hit points; sessions in a forum and in
 * a text channel; the 404 of a webhook Discord no longer knows.
 */

// The webhooks: the party's text channel, a forum, a player's own channel
const PARTY = { id: '1100000000000000001', token: 'party-token' };
const FORUM = { id: '1100000000000000002', token: 'forum-token' };
const OWN = { id: '1100000000000000003', token: 'own-token' };
const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;

// A method run as a user, as DDP would
const as = (userId: string) => ({ userId });
const call = (method: any, userId: string, args: any) => method._execute(as(userId), args);

// All a message says: a card's texts, an embed's, plain content
const texts = (body: any): string => JSON.stringify(body);

if (Meteor.isServer) describe('A party\'s Discord channel and the sessions', function () {
  this.timeout(30000);
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  const [gmId, memberId, strangerId] = [Random.id(), Random.id(), Random.id()];
  const [gmChar, memberChar, monster, strangerChar, folderId] = [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const creatureIds = [gmChar, memberChar, monster, strangerChar];

  beforeEach(async function () {
    fake = await fakeDiscord({ channels: { [FORUM.id]: 'forum' } });
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await Meteor.users.rawCollection().insertMany([
      { _id: gmId, createdAt: new Date(), username: `discord-gm-${gmId}`, preferences: { language: 'fr' } },
      { _id: memberId, createdAt: new Date(), username: `discord-member-${memberId}`, preferences: { language: 'en' } },
      { _id: strangerId, createdAt: new Date(), username: `discord-stranger-${strangerId}` },
    ] as any[]);
    await Creatures.rawCollection().insertMany([
      { _id: gmChar, name: 'Gandalf', type: 'pc', owner: gmId, readers: [], writers: [], settings: {} },
      { _id: memberChar, name: 'Aria', type: 'pc', owner: memberId, readers: [], writers: [gmId], color: '#1976d2', settings: {} },
      { _id: monster, name: 'Goblin', type: 'monster', owner: gmId, readers: [], writers: [], settings: {} },
      { _id: strangerChar, name: 'Stranger', type: 'pc', owner: strangerId, readers: [], writers: [], public: true, settings: {} },
    ] as any[]);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [memberId], creatures: creatureIds, order: 0,
    } as any);
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
  });

  afterEach(async function () {
    await settle();
    setWebhookSender(previous);
    await fake.close();
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: [gmId, memberId, strangerId] } }),
      Creatures.removeAsync({ _id: { $in: creatureIds } }),
      CreatureFolders.removeAsync(folderId),
      CreatureLogs.removeAsync({ creatureId: { $in: creatureIds } }),
      CreatureProperties.removeAsync({ 'root.id': { $in: creatureIds } }),
    ]);
  });

  async function settle() {
    await discordIntakeIdle();
    await initiativeIntakeIdle();
    await sender.idle();
  }

  /** The requests to a webhook since the last call */
  let seen = 0;
  async function requests(webhook?: { id: string }): Promise<FakeRequest[]> {
    await settle();
    const fresh = fake.requests.slice(seen);
    seen = fake.requests.length;
    return webhook ? fresh.filter(request => request.webhookId === webhook.id) : fresh;
  }
  beforeEach(function () {
    seen = 0;
  });

  const roll = (creatureId: string, content: any[] = [{ value: '1d20 + 5' }, { value: '1d20 [11] + 5' }, { value: '16' }]) =>
    insertCreatureLogWork({ log: { creatureId, content } });
  const setOwnWebhook = (creatureId: string, webhook?: { id: string, token: string }) => Creatures.updateAsync(creatureId,
    webhook ? { $set: { 'settings.discordWebhook': url(webhook) } } : { $unset: { 'settings.discordWebhook': 1 } });
  const folder = () => CreatureFolders.findOneAsync(folderId);

  describe('rolls', function () {
    it('posts a party character\'s roll to the party, in the game master\'s language, once when its webhook is the party\'s', async function () {
      await setOwnWebhook(memberChar, PARTY);
      await roll(memberChar);
      const [card, ...more] = await requests(PARTY);
      assert.lengthOf(more, 0, 'one message for the one webhook');
      assert.equal(card.body.username, 'Aria');
      assert.include(texts(card.body), 'Jet : 1d20 + 5', 'the game master\'s French');

      await setOwnWebhook(memberChar, OWN);
      await roll(memberChar);
      const sent = await requests();
      assert.sameMembers(sent.map(request => request.webhookId), [PARTY.id, OWN.id]);
      assert.include(texts(sent.find(request => request.webhookId === OWN.id)?.body), 'Roll: 1d20 + 5', 'the player\'s English');
    });

    it('never posts a monster\'s log, nor a character of someone outside the party', async function () {
      await roll(monster);
      await roll(strangerChar);
      assert.lengthOf(await requests(), 0);
      await roll(gmChar);
      assert.lengthOf(await requests(PARTY), 1, 'the game master\'s own character is the party\'s');
    });

    it('leaves out the lines that give a monster\'s hit points away', async function () {
      await roll(memberChar, [
        { name: 'Longsword', value: 'A trusty blade' },
        { ...logLine({ name: msg('logs.attributeDamaged', { type: 'Health bar' }), value: '-7 Hit Points' }), targetIds: [monster] },
        { ...logLine({ name: msg('logs.attributeDamaged', { type: 'Health bar' }), value: '-3 Hit Points' }), targetIds: [gmChar] },
      ]);
      const [card] = await requests(PARTY);
      assert.notInclude(texts(card.body), '-7 Hit Points');
      assert.include(texts(card.body), '-3 Hit Points');
    });

    it('posts a name Discord would refuse, readable', async function () {
      await Creatures.updateAsync(memberChar, { $set: { name: 'Clyde of Discord' } });
      await roll(memberChar);
      const sent = await requests(PARTY);
      assert.lengthOf(sent, 1, 'taken at once');
      assert.equal(sent[0].body.username, 'C lyde of D iscord');
    });

    it('follows the game master\'s switches: all off, rolls off', async function () {
      await call(setPartyPublishing, gmId, { folderId, enabled: false });
      await roll(memberChar);
      assert.lengthOf(await requests(), 0, 'publishing off');
      await call(setPartyPublishing, gmId, { folderId, enabled: true, publish: { rolls: false } });
      await roll(memberChar);
      assert.lengthOf(await requests(), 0, 'rolls off');
      // The character's own webhook, the party's: it posts as its own, in its owner's language
      await setOwnWebhook(memberChar, PARTY);
      await roll(memberChar);
      const sent = await requests(PARTY);
      assert.lengthOf(sent, 1);
      assert.include(texts(sent[0].body), 'Roll: 1d20 + 5');
    });

    it('forgets the party\'s webhook when Discord no longer knows it', async function () {
      await fake.close();
      fake = await fakeDiscord({ channels: { [PARTY.id]: 'gone' } });
      sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
      setWebhookSender(sender);
      seen = 0;
      await roll(memberChar);
      await settle();
      const after = await folder();
      assert.notProperty(after, 'discord');
      assert.notProperty(after, 'discordPosting', 'the players are told it no longer posts');
    });
  });

  describe('the fight', function () {
    beforeEach(async function () {
      // A monster's hit points and a creature added by hand's, which must
      // never reach the channel; a condition, which does
      await CreatureProperties.rawCollection().insertMany([
        {
          _id: Random.id(), type: 'attribute', attributeType: 'healthBar', variableName: 'hitPoints', name: 'Hit Points',
          value: 4321, total: 4321, root: { id: monster, collection: 'creatures' }, left: 1, right: 2,
        },
        {
          _id: Random.id(), type: 'buff', tags: ['condition'], name: 'Prone',
          root: { id: monster, collection: 'creatures' }, left: 3, right: 4,
        },
      ] as any[]);
      await call(addInitiativeEntry, gmId, { folderId, name: 'Ogre', bonus: 1, hp: 4322, ac: 13 });
    });

    async function fight() {
      await call(rollInitiative, gmId, { folderId });
      const started = await requests(PARTY);
      await call(advanceInitiative, gmId, { folderId, step: 1 });
      const turned = await requests(PARTY);
      const ogre = (await folder())?.initiative.entries.find((entry: any) => entry.name === 'Ogre');
      await call(setInitiativeEntryOut, gmId, { folderId, entryId: ogre._id, out: true });
      const changed = await requests(PARTY);
      await call(endInitiative, gmId, { folderId });
      const ended = await requests(PARTY);
      return { started, turned, changed, ended };
    }

    const isInitiative = (request: FakeRequest) => /^Combat — round/.test(request.body?.embeds?.[0]?.title || '');
    const isTurnLine = (request: FakeRequest) => /^(À toi\u00a0:|Au tour de) /.test(request.body?.content || '');
    const isStart = (request: FakeRequest) => request.body?.content === '**Début du combat**';
    const isSummary = (request: FakeRequest) => /^Fin du combat/.test(request.body?.embeds?.[0]?.title || '');

    it('posts the initiative when the fight starts, edits it at each turn and change, sums the fight up at its end', async function () {
      const { started, turned, changed, ended } = await fight();
      // The start: the initiative message, which says so (Discord returns its
      // id), then whose turn it is, the line that notifies. Two messages
      assert.deepEqual(started.map(request => [isStart(request), isInitiative(request), isTurnLine(request)]),
        [[false, true, false], [false, false, true]]);
      assert.equal(started[0].body.embeds[0].title, 'Combat — round 1');
      assert.equal(started[0].query.wait, 'true');
      const messageId = fake.messages.size && [...fake.messages.values()].find(message => message.embeds)?.id;
      assert.include(started[0].body.embeds[0].description, 'Prone', 'a monster\'s conditions show');
      // A turn: the same message, edited, and the turn's line
      assert.deepEqual(turned.map(request => request.method), ['PATCH', 'POST']);
      assert.equal(turned[0].messageId, messageId);
      assert.isTrue(isTurnLine(turned[1]));
      // A change: the same message, edited
      assert.deepEqual(changed.map(request => [request.method, request.messageId]), [['PATCH', messageId]]);
      assert.include(changed[0].body.embeds[0].description, '~~', 'the ogre out of the fight');
      // The end: the message closed, then the summary
      assert.equal(ended[0].method, 'PATCH');
      assert.equal(ended[0].body.embeds[0].title, 'Combat terminé — round 1');
      assert.isTrue(isSummary(ended[1]));
      assert.include(ended[1].body.embeds[0].title, 'The table');
      assert.notProperty((await folder())?.discord, 'initiative', 'the next fight has a message of its own');
      // Never a monster's hit points, nor anything about them
      const all = JSON.stringify([...started, ...turned, ...changed, ...ended].map(request => request.body));
      assert.notInclude(all, '4321');
      assert.notInclude(all, '4322');
      assert.notMatch(all, /initiativeStats|Indemne|En péril|bloodied|unhurt/);
    });

    for (const kind of ['initiative', 'turns', 'combat'] as const) {
      it(`leaves out ${kind} when the game master turns it off`, async function () {
        await call(setPartyPublishing, gmId, { folderId, publish: { [kind]: false } });
        await requests();
        const all = Object.values(await fight()).flat();
        const shown = {
          initiative: all.some(isInitiative) || all.some(request => request.method === 'PATCH'),
          turns: all.some(isTurnLine),
          combat: all.some(isStart) || all.some(isSummary),
        };
        assert.deepEqual(shown, { initiative: kind !== 'initiative', turns: kind !== 'turns', combat: kind !== 'combat' });
        // Without the initiative message, a line says the fight starts
        assert.equal(all.some(isStart), kind === 'initiative');
      });
    }

    it('posts nothing of the fight with publishing off', async function () {
      await call(setPartyPublishing, gmId, { folderId, enabled: false });
      await requests();
      assert.lengthOf(Object.values(await fight()).flat(), 0);
    });
  });

  describe('sessions', function () {
    it('opens a forum post for the party\'s session, posts everything in it, and opens another by itself after the end', async function () {
      await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
      const opened = await call(startPartySession, gmId, { folderId, timeZone: 'Europe/Paris' });
      assert.equal(opened.kind, 'forum');
      assert.match(opened.name, /^Séance du \d+ \w+ \d{4} — The table$/);
      const [header] = await requests(FORUM);
      assert.equal(header.body.thread_name, opened.name);
      assert.equal(header.query.wait, 'true');
      const session = (await folder())?.discord.session;
      assert.equal(session.threadId, [...fake.threads][0]);

      await roll(memberChar);
      const [inside] = await requests(FORUM);
      assert.equal(inside.query.thread_id, session.threadId);

      await call(endPartySession, gmId, { folderId });
      await roll(memberChar);
      // A forum takes no message outside a post: a new session, the roll in it
      const after = await requests(FORUM);
      assert.deepEqual(after.map(request => [!!request.body.thread_name, request.query.thread_id ?? null]).slice(1),
        [[true, null], [false, (await folder())?.discord.session.threadId]]);
      assert.notEqual((await folder())?.discord.session.threadId, session.threadId);
    });

    it('marks the session with a header message in a text channel, where a webhook cannot open a thread', async function () {
      const opened = await call(startPartySession, gmId, { folderId, timeZone: 'Europe/Paris' });
      assert.equal(opened.kind, 'channel');
      const [refused, header] = await requests(PARTY);
      assert.property(refused.body, 'thread_name');
      assert.notProperty(header.body, 'thread_name');
      assert.match(header.body.content, /^## Séance du/);
      const session = (await folder())?.discord.session;
      assert.equal(session.kind, 'channel');
      assert.equal(session.messageId, [...fake.messages.keys()][0], 'the header\'s id');
      assert.notProperty(session, 'threadId');
      await roll(memberChar);
      const [message] = await requests(PARTY);
      assert.notProperty(message.query, 'thread_id');
    });

    it('ends a session whose forum post was deleted', async function () {
      await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
      await call(startPartySession, gmId, { folderId });
      const first = (await folder())?.discord.session.threadId;
      fake.deleteThread(first);
      await requests();
      await roll(memberChar);
      const sent = await requests(FORUM);
      assert.equal(sent[0].query.thread_id, first, 'tried in it first');
      const second = (await folder())?.discord.session.threadId;
      assert.notEqual(second, first);
      assert.equal(sent.at(-1)?.query.thread_id, second, 'then in a new one');
    });

    it('opens no session with sessions turned off, and posts to the channel', async function () {
      await call(startPartySession, gmId, { folderId });
      await call(setPartyPublishing, gmId, { folderId, publish: { sessions: false } });
      try {
        await call(startPartySession, gmId, { folderId });
        assert.fail('opened a session');
      } catch (error: any) {
        assert.equal(error.error, 'discord.sessionsOff');
      }
      await requests();
      // A forum without sessions takes nothing: the message is dropped, no post opens
      await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
      await roll(memberChar);
      const sent = await requests(FORUM);
      assert.lengthOf(sent, 1);
      assert.notProperty(sent[0].body, 'thread_name');
      assert.notProperty(sent[0].query, 'thread_id');
    });

    it('opens a character\'s own session, unless its webhook is the party\'s', async function () {
      await setOwnWebhook(memberChar, FORUM);
      assert.isNull(await call(characterPartyWebhook, memberId, { creatureId: memberChar }));
      const opened = await call(startCharacterSession, memberId, { creatureId: memberChar, timeZone: 'America/New_York' });
      assert.equal(opened.kind, 'forum');
      assert.match(opened.name, /^Session of October \d+, 2026 — Aria$|^Session of \w+ \d+, \d{4} — Aria$/);
      const session = (await Creatures.findOneAsync(memberChar))?.discordSession;
      await requests();
      await roll(memberChar);
      const [inside] = await requests(FORUM);
      assert.equal(inside.query.thread_id, session?.threadId);
      await call(endCharacterSession, memberId, { creatureId: memberChar });
      assert.notProperty(await Creatures.findOneAsync(memberChar), 'discordSession');

      await setOwnWebhook(memberChar, PARTY);
      assert.deepEqual(await call(characterPartyWebhook, memberId, { creatureId: memberChar }), { name: 'The table' });
      try {
        await call(startCharacterSession, strangerId, { creatureId: memberChar });
        assert.fail('a stranger opened a session');
      } catch (error: any) {
        assert.notEqual(error.message, 'a stranger opened a session');
      }
    });
  });

  describe('the game master\'s settings', function () {
    it('are the game master\'s, take only a Discord webhook, and tell the players what is posted', async function () {
      assert.deepEqual((await folder())?.discordPosting, { rolls: true, combat: true }, 'all of it by default');
      for (const userId of [memberId, strangerId]) {
        for (const [method, args] of [
          [setPartyWebhook, { folderId, webhook: url(OWN) }],
          [setPartyPublishing, { folderId, enabled: false }],
          [startPartySession, { folderId }],
          [endPartySession, { folderId }],
        ] as const) {
          try {
            await call(method, userId, args);
            assert.fail(`${(method as any).name} as ${userId}`);
          } catch (error: any) {
            assert.equal(error.error, 'discord.denied', (method as any).name);
          }
        }
      }
      try {
        await call(setPartyWebhook, gmId, { folderId, webhook: 'https://evil.example/api/webhooks/1/abc' });
        assert.fail('took another host');
      } catch (error: any) {
        assert.equal(error.error, 'discord.invalid');
      }
      for (const kind of PUBLISH_KINDS) {
        await call(setPartyPublishing, gmId, { folderId, publish: { [kind]: false } });
      }
      assert.notProperty(await folder(), 'discordPosting', 'nothing the players would see');
      assert.deepEqual((await folder())?.discord.publish,
        Object.fromEntries(PUBLISH_KINDS.map(kind => [kind, false])));
      await call(setPartyPublishing, gmId, { folderId, publish: { turns: true } });
      assert.deepEqual((await folder())?.discordPosting, { combat: true });
      await call(setPartyPublishing, gmId, { folderId, enabled: false });
      assert.notProperty(await folder(), 'discordPosting');
      await call(setPartyWebhook, gmId, { folderId, webhook: '' });
      assert.notProperty(await folder(), 'discord');
    });
  });
});
