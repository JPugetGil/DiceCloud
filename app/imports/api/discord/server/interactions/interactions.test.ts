import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs, { logRoll } from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import { createTestCreature } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { unloadAllCreatures } from '/imports/api/engine/loadCreatures';

/*
 * Discord's interactions (D6, D7), sent to the app's endpoint by the local
 * fake of Discord, signed with its test key: the signature, the commands and
 * their refusals, the autocompletions, the deferred replies the fake records,
 * a roll's entry posted once per channel, a monster's hit points never
 * public, the buttons and their rights, and the commands' registration.
 */

if (Meteor.isServer) describe('Discord\'s interactions: commands and buttons (D6, D7)', function () {
  this.timeout(60000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { setInteractionsPublicKey } = require('/imports/api/discord/server/interactions/interactionSignature');
  const { setOAuthConfig, oauthConfig } = require('/imports/api/discord/server/oauthClient');
  const { DiscordActiveCharacters } = require('/imports/api/discord/server/interactions/interactionCharacters');
  const { DiscordRerolls } = require('/imports/api/discord/server/interactions/interactionRerolls');
  const {
    registerCommands, mayRegisterCommands, DiscordCommandRegistrations,
  } = require('/imports/api/discord/server/interactions/commandRegistration');
  const { COMMANDS, commandsHash } = require('/imports/api/discord/server/interactions/commandDefinitions');
  const { resetInteractionLimits } = require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { initiativeChanged, initiativeIntakeIdle } = require('/imports/api/creature/log/server/discordInitiative');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  const { DISCORD_API } = require('/imports/api/creature/log/server/webhookSender');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const APP = '1600000000000000001';
  const GUILD = '1500000000000000001';
  const CHANNEL = '1500000000000000002';
  const PARTY_CHANNEL = '1500000000000000003';
  const PLAYER = '1400000000000000042';
  const GM = '1400000000000000043';
  const OTHER = '1400000000000000044';
  const STRANGER = '1400000000000000099';
  const [playerId, gmId, otherId, creatureId, monsterId, folderId] = Array.from({ length: 6 }, () => Random.id());
  const userIds = [playerId, gmId, otherId];

  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previousSender: WebhookSender | undefined;
  let previousConfig: unknown;
  let previousKey: unknown;
  const endpoint = () => Meteor.absoluteUrl('discord/interactions');

  const PROPS = [
    { type: 'attribute', attributeType: 'ability', variableName: 'strength', name: 'Strength', baseValue: { calculation: '14' } },
    { type: 'attribute', attributeType: 'ability', variableName: 'wisdom', name: 'Wisdom', baseValue: { calculation: '12' } },
    { type: 'skill', skillType: 'skill', variableName: 'perception', ability: 'wisdom', name: 'Perception' },
    { type: 'skill', skillType: 'save', variableName: 'strengthSave', ability: 'strength', name: 'Strength Save' },
    {
      type: 'attribute', attributeType: 'healthBar', variableName: 'hitPoints', name: 'Hit Points',
      baseValue: { calculation: '20' }, healthBarDamageOrder: 1,
    },
    // As the libraries make it: damaged first, never healed, set above its total
    {
      type: 'attribute', attributeType: 'healthBar', variableName: 'tempHP', name: 'Temporary Hit Points',
      baseValue: { calculation: '0' }, ignoreUpperLimit: true, healthBarDamageOrder: 0, healthBarNoHealing: true,
    },
  ];

  beforeEach(async function () {
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previousSender = setWebhookSender(sender);
    previousConfig = setOAuthConfig({
      clientId: APP, clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback'),
    });
    previousKey = setInteractionsPublicKey(fake.publicKey);
    resetInteractionLimits();
    await Meteor.users.rawCollection().insertMany([
      { _id: playerId, createdAt: new Date(), username: `discord-i-player-${playerId}`, discordAccount: { id: PLAYER, username: 'Aria' } },
      { _id: gmId, createdAt: new Date(), username: `discord-i-gm-${gmId}`, discordAccount: { id: GM, username: 'GM' } },
      { _id: otherId, createdAt: new Date(), username: `discord-i-other-${otherId}`, discordAccount: { id: OTHER, username: 'Other' } },
    ] as any[]);
    await createTestCreature({ _id: creatureId, name: 'Aria', owner: playerId, type: 'pc', props: PROPS as any });
    await createTestCreature({ _id: monsterId, name: 'Goblin', owner: gmId, type: 'monster', props: PROPS as any });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [creatureId, monsterId], order: 0,
      discord: { channel: { webhookId: '1700000000000000001', guildId: GUILD, channelId: PARTY_CHANNEL, connectedAt: new Date() } },
    } as any);
  });

  afterEach(async function () {
    await discordIntakeIdle();
    await initiativeIntakeIdle();
    await sender.idle();
    setWebhookSender(previousSender);
    setOAuthConfig(previousConfig as any);
    setInteractionsPublicKey(previousKey as any);
    await fake.close();
    await unloadAllCreatures();
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: userIds } }),
      Creatures.removeAsync({ _id: { $in: [creatureId, monsterId] } }),
      CreatureProperties.removeAsync({ 'root.id': { $in: [creatureId, monsterId] } }),
      CreatureLogs.removeAsync({ creatureId: { $in: [creatureId, monsterId] } }),
      CreatureFolders.removeAsync(folderId),
      DiscordActiveCharacters.removeAsync({}),
      DiscordRerolls.removeAsync({}),
      DiscordCommandRegistrations.removeAsync({}),
      ConnectedWebhooks.removeAsync({}),
    ]);
  });

  type Where = { user?: string, guild?: string, channel?: string, locale?: string };
  const base = ({ user = PLAYER, guild = GUILD, channel = CHANNEL, locale = 'en-US' }: Where = {}) => ({
    application_id: APP, locale, channel_id: channel,
    ...guild ? { guild_id: guild, member: { user: { id: user } } } : { user: { id: user } },
  });
  const option = (name: string, value: unknown, type = 3) => ({ name, type, value });
  const command = (name: string, options: any[] = [], where: Where = {}) => fake.interact(endpoint(), {
    type: 2, ...base(where), data: { name, options },
  });
  const click = (customId: string, where: Where = {}, message: Record<string, unknown> = { id: '1800000000000000001', flags: 0 }) => fake.interact(endpoint(), {
    type: 3, ...base(where), data: { custom_id: customId, component_type: 2 }, message,
  });
  const autocomplete = (name: string, options: any[], where: Where = {}) => fake.interact(endpoint(), {
    type: 4, ...base(where), data: { name, options },
  });

  async function waitFor<T>(condition: () => T | Promise<T>, what: string, timeoutMs = 20000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const value = await condition();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  /** The deferred reply, once edited */
  const edited = (token: string) => waitFor(() => fake.interactions.get(token)?.edits.at(-1), 'the reply');
  const text = (message: any) => JSON.stringify(message);
  const customIds = (message: any): string[] => [...text(message).matchAll(/"custom_id":"([^"]+)"/g)].map(match => match[1]);
  const hitPoints = async (id: string) => (await CreatureProperties.findOneAsync({ 'root.id': id, variableName: 'hitPoints' }) as any)?.value;
  const logCount = (id: string) => CreatureLogs.find({ creatureId: id }).countAsync();

  describe('the endpoint', function () {
    it('answers a signed PING, refuses a wrong, missing or old signature, and is off without the public key', async function () {
      assert.deepEqual((await fake.interact(endpoint(), { type: 1 })).answer, { type: 1 });
      assert.equal((await fake.interact(endpoint(), { type: 1 }, { tamper: true })).status, 401);
      assert.equal((await fake.interact(endpoint(), { type: 1 }, { unsigned: true })).status, 401);
      assert.equal((await fake.interact(endpoint(), { type: 1 }, { age: 600 })).status, 401, 'a request played again later');
      assert.equal((await fake.interact(endpoint(), { type: 1 }, { age: 60 })).status, 200);
      setInteractionsPublicKey(undefined);
      assert.equal((await fake.interact(endpoint(), { type: 1 })).status, 404);
    });

    it('tells a Discord account linked to no DiceCloud account how to link it, for its user alone', async function () {
      const { answer } = await command('roll', [option('formula', '1d20')], { user: STRANGER, locale: 'fr' });
      assert.equal(answer.type, 4);
      assert.equal(answer.data.flags, 64);
      assert.include(answer.data.content, 'compte DiceCloud');
      assert.include(text(answer), Meteor.absoluteUrl('account'));
      assert.equal(await logCount(creatureId), 0);
    });

    it('slows down a user who sends too many', async function () {
      const answers: any[] = [];
      for (let i = 0; i < 9; i += 1) answers.push((await command('character')).answer);
      assert.notInclude(answers[7].data.content, 'Too many');
      assert.include(answers[8].data.content, 'Too many');
      assert.notInclude((await command('character', [], { user: GM })).answer.data.content, 'Too many', 'per user');
    });

    it('never logs an interaction\'s token', async function () {
      await fake.close();
      fake = await fakeDiscord({
        override: request => request.method === 'PATCH' ? { status: 500, headers: { 'Content-Type': 'application/json' }, body: { message: 'down' } } : undefined,
      });
      setOAuthConfig({ clientId: APP, clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback') });
      setInteractionsPublicKey(fake.publicKey);
      const logged: string[] = [];
      const [warn, log] = [console.warn, console.log];
      console.warn = (...args: unknown[]) => logged.push(args.join(' '));
      console.log = (...args: unknown[]) => logged.push(args.join(' '));
      let token: string | undefined;
      try {
        ({ token } = await command('roll', [option('formula', '1d20'), option('character', creatureId)]));
        await waitFor(() => logged.some(line => line.includes('refused')), 'the refusal logged');
      } finally {
        console.warn = warn;
        console.log = log;
      }
      assert.notInclude(logged.join('\n'), token as string);
    });
  });

  describe('the commands', function () {
    it('/roll: the character\'s roll, deferred then edited as the card, logged, with its reroll buttons', async function () {
      const asked = await command('roll', [option('formula', '1d20 + 2')]);
      assert.include(asked.answer.data.content, 'Which character', 'no character chosen, no party here');
      const { answer, token } = await command('roll', [option('formula', '1d20 + 2'), option('character', creatureId)]);
      assert.deepEqual(answer, { type: 5 }, 'deferred, public');
      const reply = await edited(token);
      assert.equal(reply.flags, 1 << 15, 'a Components V2 card');
      assert.include(text(reply), '**Aria**');
      assert.include(text(reply), 'Roll: 1d20 + 2');
      assert.include(text(reply), Meteor.absoluteUrl(`character/${creatureId}`));
      const ids = customIds(reply);
      assert.lengthOf(ids, 2);
      assert.match(ids[0], /^dc:reroll:\w+:1$/);
      assert.match(ids[1], /^dc:reroll:\w+:-1$/);
      assert.equal(await logCount(creatureId), 1, 'in the character\'s log');
      // Not a single d20: no reroll
      const twice = await command('roll', [option('formula', '2d20'), option('character', creatureId)]);
      assert.lengthOf(customIds(await edited(twice.token)), 0);
    });

    it('/character chooses the character for this server; /roll then uses it; secret answers its user alone', async function () {
      const chosen = await command('character', [option('name', 'aria')]);
      assert.include(chosen.answer.data.content, 'Aria is now your character on this server');
      assert.equal(chosen.answer.data.flags, 64);
      assert.include((await command('character')).answer.data.content, 'Aria');
      const { answer, token } = await command('roll', [option('formula', '1d6'), option('secret', true, 5)]);
      assert.deepEqual(answer, { type: 5, data: { flags: 64 } });
      assert.include(text(await edited(token)), '**Aria**');
      // Another server: nothing chosen there
      assert.include((await command('roll', [option('formula', '1d6')], { guild: '1500000000000000077' })).answer.data.content, 'Which character');
    });

    it('in a party\'s channel, the player\'s only character there is the one', async function () {
      const { answer, token } = await command('roll', [option('formula', '1d4')], { channel: PARTY_CHANNEL });
      assert.equal(answer.type, 5);
      assert.include(text(await edited(token)), '**Aria**');
    });

    it('/check and /save: the sheet\'s check, with advantage, logged', async function () {
      const check = await command('check', [option('skill', 'perception'), option('advantage', 1, 4), option('character', creatureId)]);
      const reply = await edited(check.token);
      assert.include(text(reply), 'Perception');
      // The log's own words, not the buttons'
      assert.include(text(reply), '(Advantage)');
      assert.include(text(reply), '~~', 'the lower die dropped');
      assert.lengthOf(customIds(reply), 2);
      const save = await command('save', [option('ability', 'Strength Save'), option('character', creatureId)]);
      assert.include(text(await edited(save.token)), 'Strength');
      const unknown = await command('check', [option('skill', 'juggling'), option('character', creatureId)]);
      assert.include(unknown.answer.data.content, 'no skill or ability');
      assert.equal(await logCount(creatureId), 2);
    });

    it('autocompletes the characters and the checks, nothing for someone not linked', async function () {
      const characters = await autocomplete('roll', [option('formula', '1d20'), { ...option('character', 'ar'), focused: true }]);
      assert.equal(characters.answer.type, 8);
      assert.deepEqual(characters.answer.data.choices, [{ name: 'Aria', value: creatureId }]);
      const skills = await autocomplete('check', [{ ...option('skill', 'perc'), focused: true }, option('character', creatureId)]);
      assert.deepEqual(skills.answer.data.choices.map((choice: any) => choice.value), ['perception']);
      const saves = await autocomplete('save', [{ ...option('ability', ''), focused: true }, option('character', creatureId)]);
      assert.deepEqual(saves.answer.data.choices.map((choice: any) => choice.value), ['strengthSave']);
      // The game master's monsters, in their party's channel only
      const gm = await autocomplete('hp', [{ ...option('character', ''), focused: true }], { user: GM, channel: PARTY_CHANNEL });
      assert.deepEqual(gm.answer.data.choices.map((choice: any) => choice.value), [monsterId]);
      const gmElsewhere = await autocomplete('hp', [{ ...option('character', ''), focused: true }], { user: GM });
      assert.deepEqual(gmElsewhere.answer.data.choices, []);
      assert.deepEqual((await autocomplete('roll', [{ ...option('character', ''), focused: true }], { user: STRANGER })).answer.data.choices, []);
    });

    it('/hp: seen by its user alone; changed by an editor, through the engine, and told to the channel', async function () {
      const seen = await command('hp', [option('character', creatureId)], { locale: 'fr' });
      assert.equal(seen.answer.data.flags, 64);
      assert.include(seen.answer.data.content, 'Aria : 20 / 20 points de vie');
      const damaged = await command('hp', [option('damage', 5, 4), option('temporary', 3, 4), option('character', creatureId)]);
      assert.deepEqual(damaged.answer, { type: 5 }, 'public');
      const reply = await edited(damaged.token);
      assert.include(reply.content, 'Aria has 3 temporary hit points');
      assert.include(reply.content, 'Aria takes 5 damage');
      // The temporary hit points take the damage first
      assert.include(reply.content, 'Aria: 18 / 20 hit points');
      assert.equal(await hitPoints(creatureId), 18);
      const healed = await command('hp', [option('healing', 10, 4), option('character', creatureId)]);
      assert.include((await edited(healed.token)).content, '20 / 20');
      assert.isAtLeast(await logCount(creatureId), 3, 'each change in the log');
    });

    it('a monster: its game master alone, and never anything public, its hit points least of all', async function () {
      const gmHp = await command('hp', [option('damage', 3, 4), option('character', monsterId)], { user: GM, channel: PARTY_CHANNEL });
      assert.deepEqual(gmHp.answer, { type: 5, data: { flags: 64 } });
      await edited(gmHp.token);
      assert.isTrue(fake.interactions.get(gmHp.token)?.ephemeral);
      const gmRoll = await command('roll', [option('formula', '1d20'), option('character', 'Goblin')], { user: GM, channel: PARTY_CHANNEL });
      assert.deepEqual(gmRoll.answer, { type: 5, data: { flags: 64 } }, 'its rolls too: they tell its stats');
      await edited(gmRoll.token);
      const player = await command('hp', [option('character', 'Goblin')], { channel: PARTY_CHANNEL });
      assert.include(player.answer.data.content, 'None of your characters');
      assert.equal(await hitPoints(monsterId), 17);
    });

    it('posts a command\'s entry once in its channel: the reply there, the webhook everywhere else', async function () {
      const webhook = { id: '1200000000000000011', token: 'pasted-token' };
      const webhookChannel = `9${webhook.id.slice(1)}`;
      await Creatures.updateAsync(creatureId, {
        $set: {
          'settings.discordWebhook': `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`,
          discordWebhookId: webhook.id,
        },
      });
      const posted = () => fake.requests.filter(request => request.method === 'POST' && request.webhookId === webhook.id).length;
      // In the webhook's channel: only the reply (Discord said where it posts)
      const here = await command('roll', [option('formula', '1d20'), option('character', creatureId)], { channel: webhookChannel });
      await edited(here.token);
      await discordIntakeIdle();
      await sender.idle();
      assert.equal(posted(), 0);
      assert.equal((await Creatures.findOneAsync(creatureId) as any).discordWebhookChannelId, webhookChannel, 'learned from Discord');
      // Elsewhere: the reply, and the webhook's post in its own channel
      const elsewhere = await command('roll', [option('formula', '1d20'), option('character', creatureId)]);
      await edited(elsewhere.token);
      await discordIntakeIdle();
      await sender.idle();
      assert.equal(posted(), 1);
    });
  });

  describe('the buttons', function () {
    async function rerollButton() {
      const { token } = await command('roll', [option('formula', '1d20 + 1'), option('character', creatureId)]);
      return customIds(await edited(token));
    }

    it('rolls again with advantage, for those who may edit the character; a gone roll is no longer current', async function () {
      const [advantage, disadvantage] = await rerollButton();
      const again = await click(advantage, {}, { id: '1', flags: 1 << 15 });
      assert.deepEqual(again.answer, { type: 5 });
      const reply = await edited(again.token);
      assert.include(text(reply), '1d20 + 1 (Advantage)');
      assert.lengthOf(customIds(reply), 2, 'buttons again');
      assert.equal(await logCount(creatureId), 2);
      const refused = await click(disadvantage, { user: OTHER }, { id: '1', flags: 1 << 15 });
      assert.equal(refused.answer.data.flags, 64);
      assert.include(refused.answer.data.content, 'Only those who can edit Aria');
      const stale = await click('dc:reroll:nothing0000000001:1', {}, { id: '1', flags: 1 << 15 });
      assert.include(stale.answer.data.content, 'no longer current');
      assert.equal(await logCount(creatureId), 2);
      // A custom_id that is not DiceCloud's
      assert.include((await click('anything else', {})).answer.data.content, 'no longer current');
    });

    it('"Next turn": the game master alone, once per turn', async function () {
      await CreatureFolders.updateAsync(folderId, {
        $set: { initiative: { round: 1, turn: 0, entries: [{ _id: 'e1', creatureId, initiative: 15 }, { _id: 'e2', creatureId: monsterId, initiative: 10 }] } },
      });
      const next = `dc:next:${folderId}:1:0`;
      assert.include((await click(next)).answer.data.content, 'Only the game master');
      const moved = await click(next, { user: GM });
      assert.deepEqual(moved.answer, { type: 6 });
      await waitFor(async () => (await CreatureFolders.findOneAsync(folderId) as any).initiative.turn === 1, 'the next turn');
      assert.include((await click(next, { user: GM })).answer.data.content, 'no longer current', 'twice moves once');
    });

    it('"End my turn": that turn\'s player or the game master; afterwards, no longer current', async function () {
      await CreatureFolders.updateAsync(folderId, {
        $set: { initiative: { round: 2, turn: 1, entries: [{ _id: 'e1', creatureId, initiative: 15 }, { _id: 'e2', creatureId: monsterId, initiative: 10 }] } },
      });
      assert.include((await click(`dc:end:${folderId}:e2:2`)).answer.data.content, 'Only Goblin\'s player or the game master');
      await CreatureFolders.updateAsync(folderId, { $set: { 'initiative.turn': 0 } });
      const ended = await click(`dc:end:${folderId}:e1:2`);
      assert.deepEqual(ended.answer, { type: 7, data: { components: [] } }, 'its button goes');
      await waitFor(async () => (await CreatureFolders.findOneAsync(folderId) as any).initiative.turn === 1, 'the next turn');
      const stale = await click(`dc:end:${folderId}:e1:2`);
      assert.deepEqual(stale.answer, { type: 7, data: { components: [] } });
      const followUp = await waitFor(() => fake.interactions.get(stale.token)?.followUps[0], 'the follow-up');
      assert.equal(followUp.flags, 64);
      assert.include(followUp.content, 'no longer current');
    });

    describe('with turn events (phase 3.1)', function () {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { turnEventsIdle } = require('/imports/api/creature/creatureFolders/server/turnEvents');
      const { reloadCachedProperties } = require('/imports/api/engine/loadCreatures');
      const { default: computeCreature } = require('/imports/api/engine/computeCreature');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const connected = { id: '1700000000000000001', token: 'connected-token' };
      const entriesAt = (round: number, turn: number) => ({
        initiative: { round, turn, entries: [{ _id: 'e1', creatureId, initiative: 15 }, { _id: 'e2', creatureId: monsterId, initiative: 10 }] },
      });
      const entries = async (id: string) => (await CreatureLogs.find({ creatureId: id }, { sort: { date: 1 } }).fetchAsync() as any[])
        .map(log => log.content.filter(line => !line.silenced).map(line => line.name));
      // The party's channel: what it was sent, as text
      const partyPosts = () => fake.requests.filter(request => request.webhookId === connected.id && request.method === 'POST')
        .map(request => text(request.body));
      async function settle() {
        await turnEventsIdle();
        await discordIntakeIdle();
        await initiativeIntakeIdle();
        await sender.idle();
      }

      beforeEach(async function () {
        await ConnectedWebhooks.rawCollection().insertOne({
          _id: connected.id, webhookId: connected.id, token: connected.token, channelId: PARTY_CHANNEL, guildId: GUILD, createdAt: new Date(),
        });
        // Aria's turn ends with a reminder; the goblin's starts with its legendary actions back
        await CreatureProperties.rawCollection().insertMany([
          {
            _id: Random.id(), type: 'trigger', name: 'Bardic reminder', event: 'turnEnd', timing: 'after',
            root: { collection: 'creatures', id: creatureId }, left: 1000, right: 1001,
          },
          {
            _id: Random.id(), type: 'trigger', name: 'Goblin boss shouts', event: 'turnStart', timing: 'after',
            root: { collection: 'creatures', id: monsterId }, left: 1000, right: 1001,
          },
          {
            _id: Random.id(), type: 'attribute', attributeType: 'resource', name: 'Legendary Actions', variableName: 'legendaryActions',
            baseValue: { calculation: '3' }, damage: 3, reset: 'turnStart', root: { collection: 'creatures', id: monsterId }, left: 1002, right: 1003,
          },
        ] as any[]);
        for (const id of [creatureId, monsterId]) {
          await computeCreature(id);
          await reloadCachedProperties(id);
        }
      });

      it('"End my turn": Aria\'s turn ends and the goblin\'s starts, once; Aria\'s entry reaches the party, the goblin\'s never', async function () {
        await CreatureFolders.updateAsync(folderId, { $set: entriesAt(2, 0) });
        const ended = await click(`dc:end:${folderId}:e1:2`);
        assert.deepEqual(ended.answer, { type: 7, data: { components: [] } });
        await waitFor(async () => (await entries(monsterId)).length, 'the goblin\'s turn to start');
        // Clicked again: no longer current, nothing happens twice
        await click(`dc:end:${folderId}:e1:2`);
        await settle();
        assert.deepEqual(await entries(creatureId), [['End of turn', 'Bardic reminder']]);
        // Its legendary actions back, silently
        assert.deepEqual(await entries(monsterId), [['Start of turn', 'Goblin boss shouts']]);
        assert.equal((await CreatureProperties.findOneAsync({ 'root.id': monsterId, variableName: 'legendaryActions' }) as any).damage, 0);
        const posts = partyPosts();
        assert.lengthOf(posts.filter(post => post.includes('Bardic reminder')), 1, 'Aria\'s entry, once');
        assert.isFalse(posts.some(post => post.includes('Goblin boss shouts') || post.includes('Legendary')), 'never the goblin\'s');
      });

      it('a turn whose only change is a reset: the resource is back, with no entry and nothing on Discord', async function () {
        const reaction = Random.id();
        await CreatureProperties.rawCollection().insertOne({
          _id: reaction, type: 'attribute', attributeType: 'resource', name: 'Reaction', variableName: 'reaction',
          baseValue: { calculation: '1' }, damage: 1, reset: 'turnStart', root: { collection: 'creatures', id: creatureId }, left: 1002, right: 1003,
        } as any);
        await computeCreature(creatureId);
        await reloadCachedProperties(creatureId);
        // The goblin's turn (nothing at its end), then Aria's, whose start only resets
        await CreatureFolders.updateAsync(folderId, { $set: entriesAt(1, 1) });
        await click(`dc:next:${folderId}:1:1`, { user: GM });
        await waitFor(async () => (await CreatureProperties.findOneAsync(reaction) as any)?.damage === 0, 'Aria\'s reaction back');
        await settle();
        await new Promise(resolve => setTimeout(resolve, 300));
        await settle();
        assert.include((await CreatureFolders.findOneAsync(folderId) as any).initiative, { round: 2, turn: 0 });
        const posts = partyPosts();
        assert.isNotEmpty(posts, 'the turn did reach the party (its initiative message)');
        assert.isFalse(posts.some(post => post.includes('Start of turn') || post.includes('Reaction')), 'nothing on Discord');
        assert.lengthOf(await entries(creatureId), 0, 'no entry in Aria\'s log');
      });

      it('"Next turn" clicked twice at once: one move, one turn start', async function () {
        await CreatureFolders.updateAsync(folderId, { $set: entriesAt(1, 0) });
        const next = `dc:next:${folderId}:1:0`;
        const clicks = await Promise.all([click(next, { user: GM }), click(next, { user: GM })]);
        assert.isTrue(clicks.some(({ answer }) => answer.type === 6), 'one moves the turn');
        await waitFor(async () => (await entries(monsterId)).length, 'the goblin\'s turn to start');
        await settle();
        await new Promise(resolve => setTimeout(resolve, 300));
        await settle();
        assert.include((await CreatureFolders.findOneAsync(folderId) as any).initiative, { round: 1, turn: 1 });
        assert.lengthOf(await entries(monsterId), 1);
        assert.lengthOf(await entries(creatureId), 1);
      });

      it('the board and Discord at once: one move, one turn start', async function () {
        await CreatureFolders.updateAsync(folderId, { $set: entriesAt(1, 0) });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { advanceInitiative } = require('/imports/api/creature/creatureFolders/methods/initiativeMethods');
        await Promise.all([
          click(`dc:next:${folderId}:1:0`, { user: GM }),
          advanceInitiative._execute({ userId: gmId }, { folderId, step: 1 }),
        ]);
        await waitFor(async () => (await entries(monsterId)).length, 'the goblin\'s turn to start');
        await settle();
        await new Promise(resolve => setTimeout(resolve, 300));
        await settle();
        assert.include((await CreatureFolders.findOneAsync(folderId) as any).initiative, { round: 1, turn: 1 });
        assert.lengthOf(await entries(monsterId), 1);
      });
    });

    it('go on the initiative messages of a connected channel, never on a pasted webhook\'s', async function () {
      const connected = { id: '1700000000000000001', token: 'connected-token' };
      await ConnectedWebhooks.rawCollection().insertOne({
        _id: connected.id, webhookId: connected.id, token: connected.token, channelId: PARTY_CHANNEL, guildId: GUILD, createdAt: new Date(),
      });
      await CreatureFolders.updateAsync(folderId, {
        $set: { initiative: { round: 1, turn: 0, entries: [{ _id: 'e1', creatureId, initiative: 15 }, { _id: 'e2', creatureId: monsterId, initiative: 10 }] } },
      });
      initiativeChanged(folderId, 'start');
      await initiativeIntakeIdle();
      await sender.idle();
      const toConnected = fake.requests.filter(request => request.webhookId === connected.id && request.method === 'POST');
      assert.include(customIds(toConnected.map(request => request.body)), `dc:next:${folderId}:1:0`);
      assert.include(customIds(toConnected.map(request => request.body)), `dc:end:${folderId}:e1:1`);

      // Pasted instead: the same messages, without a button
      const pasted = { id: '1200000000000000022', token: 'party-pasted' };
      await CreatureFolders.updateAsync(folderId, {
        $unset: { 'discord.channel': 1, 'discord.initiative': 1 },
        $set: { 'discord.webhook': `https://discord.com/api/webhooks/${pasted.id}/${pasted.token}`, 'discord.webhookId': pasted.id },
      });
      initiativeChanged(folderId, 'start');
      await initiativeIntakeIdle();
      await sender.idle();
      const toPasted = fake.requests.filter(request => request.webhookId === pasted.id && request.method === 'POST');
      assert.isAtLeast(toPasted.length, 2, 'the initiative message and the turn line');
      assert.lengthOf(customIds(toPasted.map(request => request.body)), 0);
    });
  });

  describe('the reroll buttons under a check made in DiceCloud', function () {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { insertAction } = require('/imports/api/engine/action/methods/insertAction');
    const { runAction } = require('/imports/api/engine/action/methods/runAction');
    const { invocationOf } = require('/imports/api/discord/server/interactions/interactionCommands');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const OWN = { id: '1700000000000000002', token: 'own-connected-token' };
    const PARTY = { id: '1700000000000000001', token: 'party-connected-token' };

    /** A check as the sheet's buttons make it, with what its dialog decided */
    async function appCheck(userId: string, creature: string, variables: Record<string, string>, extra: Record<string, unknown> = {}) {
      const params = { advantage: 0, ...variables, dc: null };
      const actionId = await insertAction._execute(invocationOf(userId), {
        action: {
          creatureId: creature, task: { subtaskFn: 'check', targetIds: [creature], ...params, ...extra },
          results: [], taskCount: 0, _decisions: [],
        },
      });
      await runAction._execute(invocationOf(userId), { actionId, decisions: [{ kind: 'check', value: params }] });
      await discordIntakeIdle();
      await sender.idle();
    }
    const posts = (webhook: { id: string }) => fake.requests.filter(request => request.method === 'POST' && request.webhookId === webhook.id);
    async function connect(webhook: { id: string, token: string }, channelId: string) {
      await ConnectedWebhooks.rawCollection().insertOne({
        _id: webhook.id, webhookId: webhook.id, token: webhook.token, channelId, guildId: GUILD, createdAt: new Date(),
      });
    }

    beforeEach(async function () {
      await connect(PARTY, PARTY_CHANNEL);
      await connect(OWN, CHANNEL);
      await Creatures.updateAsync(creatureId, {
        $set: { discordChannel: { webhookId: OWN.id, guildId: GUILD, channelId: CHANNEL, connectedAt: new Date() } },
      });
    });

    it('go under a check and a saving throw on the connected channels, the character\'s and the party\'s, kept once', async function () {
      await appCheck(playerId, creatureId, { skillVariableName: 'perception', abilityVariableName: 'wisdom' });
      const [own] = posts(OWN);
      const [party] = posts(PARTY);
      assert.equal(own.query.with_components, 'true');
      const ids = customIds(own.body);
      assert.lengthOf(ids, 2);
      assert.match(ids[0], /^dc:reroll:\w+:1$/);
      assert.match(ids[1], /^dc:reroll:\w+:-1$/);
      assert.deepEqual(customIds(party.body), ids, 'one roll kept for both channels');
      assert.include(text(own.body), 'Reroll with advantage');
      const kept = await DiscordRerolls.findOneAsync(ids[0].split(':')[2]);
      assert.deepInclude(kept, {
        creatureId, kind: 'check', skillVariableName: 'perception', abilityVariableName: 'wisdom', secret: false,
      });
      // A saving throw, as its button makes it
      await appCheck(playerId, creatureId, { skillVariableName: 'strengthSave', abilityVariableName: 'strength' });
      const save = customIds(posts(OWN)[1].body);
      assert.lengthOf(save, 2);
      assert.equal((await DiscordRerolls.findOneAsync(save[0].split(':')[2]))?.skillVariableName, 'strengthSave');
    });

    it('roll it again in a new message, logged, for those who may edit the character; the others are refused', async function () {
      await appCheck(playerId, creatureId, { skillVariableName: 'perception', abilityVariableName: 'wisdom' });
      const [advantage, disadvantage] = customIds(posts(OWN)[0].body);
      const before = await logCount(creatureId);
      // Clicked under the webhook's card, in the party's channel
      const again = await click(advantage, { channel: PARTY_CHANNEL }, { id: '1', flags: 1 << 15, webhook_id: OWN.id });
      assert.deepEqual(again.answer, { type: 5 }, 'a new message, for everyone');
      const reply = await edited(again.token);
      assert.include(text(reply), 'Perception');
      assert.include(text(reply), '(Advantage)');
      assert.lengthOf(customIds(reply), 2, 'its own buttons');
      assert.equal(await logCount(creatureId), before + 1);
      const refused = await click(disadvantage, { user: OTHER }, { id: '1', flags: 1 << 15 });
      assert.equal(refused.answer.data.flags, 64);
      assert.include(refused.answer.data.content, 'Only those who can edit Aria');
      assert.equal(await logCount(creatureId), before + 1);
      // A Discord account linked to nobody
      assert.include(text((await click(disadvantage, { user: STRANGER })).answer), 'not linked');
    });

    it('never go on a pasted webhook, nor without interactions, nor under a typed roll, a silent check or a made-up variable', async function () {
      const pasted = { id: '1200000000000000031', token: 'pasted-check' };
      await Creatures.updateAsync(creatureId, {
        $unset: { discordChannel: 1 },
        $set: { 'settings.discordWebhook': `https://discord.com/api/webhooks/${pasted.id}/${pasted.token}`, discordWebhookId: pasted.id },
      });
      await appCheck(playerId, creatureId, { skillVariableName: 'perception', abilityVariableName: 'wisdom' });
      const [toPasted] = posts(pasted);
      assert.exists(toPasted, 'posted');
      assert.lengthOf(customIds(toPasted.body), 0);
      assert.lengthOf(customIds(posts(PARTY)[0].body), 2, 'the party\'s connected channel has them');
      // Without the application's interactions
      setInteractionsPublicKey(undefined);
      await appCheck(playerId, creatureId, { skillVariableName: 'perception', abilityVariableName: 'wisdom' });
      assert.lengthOf(customIds(posts(PARTY)[1].body), 0);
      setInteractionsPublicKey(fake.publicKey);
      // A roll typed in the log; a check the action keeps quiet
      await (logRoll as any)._execute(invocationOf(playerId), { roll: '1d20 + 2', creatureId });
      await appCheck(playerId, creatureId, { skillVariableName: 'perception' }, { silent: true });
      // A decision whose variable is no variable's name (the client's)
      await appCheck(playerId, creatureId, { skillVariableName: 'not a variable { }' });
      await discordIntakeIdle();
      await sender.idle();
      assert.lengthOf(customIds(posts(PARTY).slice(2).map(request => request.body)), 0);
      assert.equal(await DiscordRerolls.find({ creatureId }).countAsync(), 1, 'kept for the first check alone');
    });

    it('never show a monster\'s check to the players: nothing in the party\'s channel; its game master\'s own channel has them', async function () {
      const gmOwn = { id: '1700000000000000003', token: 'gm-own-token' };
      await connect(gmOwn, '1500000000000000004');
      await Creatures.updateAsync(monsterId, {
        $set: { discordChannel: { webhookId: gmOwn.id, guildId: GUILD, channelId: '1500000000000000004', connectedAt: new Date() } },
      });
      await appCheck(gmId, monsterId, { skillVariableName: 'perception', abilityVariableName: 'wisdom' });
      assert.lengthOf(posts(PARTY), 0);
      const [own] = posts(gmOwn);
      const [advantage] = customIds(own.body);
      assert.match(advantage, /^dc:reroll:/);
      assert.include(text((await click(advantage, {})).answer), 'Only those who can edit Goblin', 'not the player');
      const again = await click(advantage, { user: GM, channel: '1500000000000000004' });
      assert.equal(again.answer.data?.flags, 64, 'for its game master alone');
      assert.include(text(await edited(again.token)), '(Advantage)');
    });
  });

  describe('the registration', function () {
    it('registers the commands with a client credentials token, once per change of their definitions', async function () {
      assert.isTrue(mayRegisterCommands(), 'with the fake');
      const first = await registerCommands();
      assert.equal(first.status, 'registered');
      assert.equal(first.count, COMMANDS.length);
      const tokenRequest = fake.requests.find(request => request.path === '/api/v10/oauth2/token');
      assert.deepEqual(tokenRequest?.body, { grant_type: 'client_credentials', scope: 'applications.commands.update' });
      assert.deepEqual(fake.clientCredentials.at(-1), { id: APP, secret: 'test-secret' });
      const registered = fake.registeredCommands.get(APP) as any[];
      assert.deepEqual(registered.map(cmd => cmd.name), ['roll', 'check', 'save', 'hp', 'character', 'connect']);
      assert.deepEqual(registered.map(cmd => cmd.name_localizations.fr), ['jet', 'test', 'sauvegarde', 'pv', 'personnage', 'connecter']);
      // /connect: in servers only, shown to those who may manage webhooks (they are checked again)
      assert.deepEqual(registered[5].contexts, [0]);
      assert.equal(registered[5].default_member_permissions, String(1 << 29));
      assert.deepEqual(registered[0].integration_types, [0, 1]);
      assert.deepEqual(registered[0].contexts, [0, 1, 2]);
      const puts = () => fake.requests.filter(request => request.method === 'PUT').length;
      assert.equal((await registerCommands()).status, 'unchanged');
      assert.equal(puts(), 1);
      await DiscordCommandRegistrations.updateAsync(APP, { $set: { hash: 'an older one' } });
      assert.equal((await registerCommands()).status, 'registered');
      assert.equal(puts(), 2);
      assert.equal((await DiscordCommandRegistrations.findOneAsync(APP))?.hash, commandsHash());
      // Never to Discord itself from development unless asked
      setOAuthConfig({ ...oauthConfig(), apiBase: DISCORD_API });
      assert.isFalse(mayRegisterCommands());
    });
  });
});
