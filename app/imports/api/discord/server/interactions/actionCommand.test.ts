import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import EngineActions from '/imports/api/engine/action/EngineActions';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import { createTestCreature } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { reloadCachedProperties, unloadAllCreatures } from '/imports/api/engine/loadCreatures';
import propsFromForest from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import {
  MAX_OPTIONS, menuMessage, selectRows, type MenuOption,
} from '/imports/api/discord/server/interactions/actionMenus';

/*
 * /action (D6, decisions of 16 October), from the local fake of Discord,
 * which signs the interactions with its test key: the menus (targets during
 * a fight, spell slot, ammunition, the action's own questions), the action
 * run as the browser runs it and posted in the channel, `secret`, the
 * refusals, every click checked again, the 25 options of a select, the dry
 * run that writes nothing, and the menus' autocompletion.
 */

describe('/action\'s menus: more options than a select holds', function () {
  const options = (count: number): MenuOption[] => Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

  it('spreads 30 options over two selects of 25 and 5, each its own custom_id', function () {
    const { rows, hidden } = selectRows(options(30), { customId: index => `id:${index}`, placeholder: 'Pick', min: 0, max: 25 });
    assert.equal(hidden, 0);
    const selects = rows.map((row: any) => row.components[0]);
    assert.deepEqual(selects.map((select: any) => select.options.length), [25, 5]);
    assert.deepEqual(selects.map((select: any) => select.custom_id), ['id:0', 'id:1']);
    assert.deepEqual(selects.map((select: any) => [select.min_values, select.max_values]), [[0, 25], [0, 5]]);
  });

  it('offers the first 100 of 120, says how many are left, and keeps the message to five rows', function () {
    const { rows, hidden } = selectRows(options(120), { customId: index => `id:${index}`, placeholder: 'Pick' });
    assert.equal(rows.length, 4);
    assert.equal(hidden, 120 - MAX_OPTIONS);
    const message = menuMessage('text', rows, [{ customId: 'a', label: 'A' }, { customId: 'b', label: 'B' }]) as any;
    assert.lengthOf(message.components, 5, 'four selects and a row of buttons');
    assert.lengthOf(message.components[4].components, 2);
    assert.isAtMost(message.components[0].components[0].options.length, 25);
    // A label longer than Discord takes is cut
    const [long] = selectRows([{ value: 'x', label: 'a'.repeat(150) }], { customId: () => 'x', placeholder: 'p' }).rows as any[];
    assert.lengthOf(long.components[0].options[0].label, 100);
  });
});

if (Meteor.isServer) describe('Discord\'s /action (D6)', function () {
  this.timeout(120000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { setInteractionsPublicKey } = require('/imports/api/discord/server/interactions/interactionSignature');
  const { setOAuthConfig } = require('/imports/api/discord/server/oauthClient');
  const { DiscordActiveCharacters } = require('/imports/api/discord/server/interactions/interactionCharacters');
  const { DiscordActionSessions, DiscordActionTargets } = require('/imports/api/discord/server/interactions/actionSessions');
  const { dryRun } = require('/imports/api/discord/server/interactions/actionReplay');
  const { resetInteractionLimits } = require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { invocationOf } = require('/imports/api/discord/server/interactions/interactionCommands');
  const { insertAction } = require('/imports/api/engine/action/methods/insertAction');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  const { seededDie } = require('/imports/api/engine/action/functions/userInput/server/actionDice');
  const { setActionAnswerBudget } = require('/imports/api/discord/server/interactions/interactionActions');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const APP = '1600000000000000001';
  const GUILD = '1500000000000000001';
  const CHANNEL = '1500000000000000002';
  const PARTY_CHANNEL = '1500000000000000003';
  const PLAYER = '1400000000000000042';
  const GM = '1400000000000000043';
  const OTHER = '1400000000000000044';
  const STRANGER = '1400000000000000099';
  const [playerId, gmId, otherId, ariaId, goblinId, strayId, folderId, otherFolderId] = Array.from({ length: 8 }, () => Random.id());
  const [
    longswordId, cunningId, flameId, blessId, shortbowId, arrowsId, silverId, secondWindId, slot1Id, slot2Id, dashId,
    feintId, ambushId, goblinHpId, scimitarId, ariaHpId,
  ] = Array.from({ length: 16 }, () => Random.id());
  const recklessId = Random.id();
  const userIds = [playerId, gmId, otherId];

  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previousSender: WebhookSender | undefined;
  let previousConfig: unknown;
  let previousKey: unknown;
  const endpoint = () => Meteor.absoluteUrl('discord/interactions');

  const hitPoints = (_id: string, total: number) => ({
    _id, type: 'attribute', attributeType: 'healthBar', variableName: 'hitPoints', name: 'Hit Points', baseValue: { calculation: String(total) },
  });
  const armor = (value: number) => ({
    type: 'attribute', attributeType: 'stat', variableName: 'armor', name: 'Armor Class', baseValue: { calculation: String(value) },
  });
  // Aria's sheet: an attack, a choice, a spell and its slots, an action on
  // several targets, a bow and its arrows, an action with no use left, one
  // that asks nothing; an attack with a choice after its roll, one with a
  // choice on a hit alone
  const ARIA_PROPS = [
    hitPoints(ariaHpId, 30),
    armor(14),
    { type: 'skill', skillType: 'save', variableName: 'dexteritySave', name: 'Dexterity Save', baseValue: { calculation: '2' } },
    {
      _id: longswordId, type: 'action', name: 'Longsword', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [
        { type: 'branch', branchType: 'hit', children: [{ type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '5' } }] },
        { type: 'branch', branchType: 'miss', children: [{ type: 'note', name: 'Missed' }] },
      ],
    },
    {
      _id: cunningId, type: 'action', name: 'Cunning Choice', target: 'self',
      children: [{ type: 'branch', branchType: 'choice', children: [{ type: 'note', name: 'Went left' }, { type: 'note', name: 'Went right' }] }],
    },
    {
      _id: flameId, type: 'spell', name: 'Sacred Flame', level: 1, prepared: true, target: 'singleTarget',
      children: [{
        type: 'savingThrow', name: 'Sacred Flame', target: 'target', dc: { calculation: '13' }, stat: 'dexteritySave',
        children: [{ type: 'branch', branchType: 'failedSave', children: [{ type: 'damage', target: 'target', damageType: 'radiant', amount: { calculation: '4' } }] }],
      }],
    },
    { _id: slot1Id, type: 'attribute', attributeType: 'spellSlot', name: 'Level 1 slots', variableName: 'slotLevel1', spellSlotLevel: { calculation: '1' }, baseValue: { calculation: '2' } },
    { _id: slot2Id, type: 'attribute', attributeType: 'spellSlot', name: 'Level 2 slots', variableName: 'slotLevel2', spellSlotLevel: { calculation: '2' }, baseValue: { calculation: '1' } },
    {
      _id: blessId, type: 'action', name: 'Mass Mending', target: 'multipleTargets',
      children: [{ type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '1' } }],
    },
    {
      _id: shortbowId, type: 'action', name: 'Shortbow', target: 'singleTarget', attackRoll: { calculation: '300000' },
      resources: { itemsConsumed: [{ _id: Random.id(), tag: 'arrow', quantity: { calculation: '1' } }], attributesConsumed: [], conditions: [] },
      children: [{ type: 'branch', branchType: 'hit', children: [{ type: 'damage', target: 'target', damageType: 'piercing', amount: { calculation: '3' } }] }],
    },
    { _id: arrowsId, type: 'item', name: 'Arrows', quantity: 20, tags: ['arrow'] },
    { _id: silverId, type: 'item', name: 'Silver arrows', quantity: 5, tags: ['arrow'] },
    { _id: secondWindId, type: 'action', name: 'Second Wind', target: 'self', uses: { calculation: '1' }, usesUsed: 1 },
    { _id: dashId, type: 'action', name: 'Dash', target: 'self', children: [{ type: 'note', name: 'Dashed' }] },
    {
      _id: feintId, type: 'action', name: 'Feint', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [{ type: 'branch', branchType: 'choice', children: [{ type: 'note', name: 'High' }, { type: 'note', name: 'Low' }] }],
    },
    // Advantage on its attack roll from an effect, as the sheet computes it
    {
      _id: recklessId, type: 'action', name: 'Reckless Strike', target: 'singleTarget', tags: ['reckless'], attackRoll: { calculation: '300000' },
      children: [{ type: 'branch', branchType: 'hit', children: [{ type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '5' } }] }],
    },
    { type: 'effect', name: 'Reckless', targetByTags: true, targetTags: ['reckless'], operation: 'advantage' },
    {
      _id: ambushId, type: 'action', name: 'Ambush', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [{
        type: 'branch', branchType: 'hit',
        children: [{ type: 'branch', branchType: 'choice', children: [{ type: 'note', name: 'Stab' }, { type: 'note', name: 'Slash' }] }],
      }],
    },
  ];
  const GOBLIN_PROPS = [
    hitPoints(goblinHpId, 70),
    armor(12),
    { type: 'skill', skillType: 'save', variableName: 'dexteritySave', name: 'Dexterity Save', baseValue: { calculation: '1' } },
    {
      _id: scimitarId, type: 'action', name: 'Scimitar', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [{ type: 'branch', branchType: 'hit', children: [{ type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '2' } }] }],
    },
  ];
  const FIGHT = {
    round: 1, turn: 0,
    entries: [{ _id: 'e1', creatureId: ariaId, initiative: 15, name: 'Aria' }, { _id: 'e2', creatureId: goblinId, initiative: 10, name: 'Goblin' }],
  };

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
      { _id: playerId, createdAt: new Date(), username: `discord-a-player-${playerId}`, discordAccount: { id: PLAYER, username: 'Aria' } },
      { _id: gmId, createdAt: new Date(), username: `discord-a-gm-${gmId}`, discordAccount: { id: GM, username: 'GM' } },
      { _id: otherId, createdAt: new Date(), username: `discord-a-other-${otherId}`, discordAccount: { id: OTHER, username: 'Other' } },
    ] as any[]);
    await createTestCreature({ _id: ariaId, name: 'Aria', owner: playerId, type: 'pc', writers: [gmId], props: ARIA_PROPS as any });
    await createTestCreature({ _id: goblinId, name: 'Goblin', owner: gmId, type: 'monster', props: GOBLIN_PROPS as any });
    // Someone else's monster, in no party of Aria's
    await createTestCreature({ _id: strayId, name: 'Stray wolf', owner: gmId, type: 'monster', props: [hitPoints(Random.id(), 9)] as any });
    await CreatureFolders.rawCollection().insertMany([
      {
        _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [ariaId, goblinId], order: 0, initiative: FIGHT,
        discord: { channel: { webhookId: '1700000000000000001', guildId: GUILD, channelId: PARTY_CHANNEL, connectedAt: new Date() } },
      },
      { _id: otherFolderId, name: 'Elsewhere', owner: gmId, members: [], creatures: [strayId], order: 1 },
    ] as any[]);
  });

  afterEach(async function () {
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previousSender);
    setOAuthConfig(previousConfig as any);
    setInteractionsPublicKey(previousKey as any);
    await fake.close();
    await unloadAllCreatures();
    const extra = await Creatures.find({ owner: gmId }, { fields: { _id: 1 } }).fetchAsync();
    const ids = [ariaId, goblinId, strayId, ...extra.map(creature => creature._id)];
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: userIds } }),
      Creatures.removeAsync({ _id: { $in: ids } }),
      CreatureProperties.removeAsync({ 'root.id': { $in: ids } }),
      CreatureVariables.removeAsync({ _creatureId: { $in: ids } }),
      CreatureLogs.removeAsync({ creatureId: { $in: ids } }),
      EngineActions.removeAsync({ creatureId: { $in: ids } }),
      CreatureFolders.removeAsync({ _id: { $in: [folderId, otherFolderId] } } as any),
      DiscordActiveCharacters.removeAsync({}),
      DiscordActionSessions.removeAsync({}),
      DiscordActionTargets.removeAsync({}),
      ConnectedWebhooks.removeAsync({}),
    ]);
  });

  type Where = { user?: string, channel?: string, locale?: string };
  const base = ({ user = PLAYER, channel = CHANNEL, locale = 'en-US' }: Where = {}) => ({
    application_id: APP, locale, channel_id: channel, guild_id: GUILD, member: { user: { id: user } },
  });
  const option = (name: string, value: unknown, type = 3) => ({ name, type, value });
  const command = (options: any[], where: Where = {}) => {
    resetInteractionLimits();
    return fake.interact(endpoint(), { type: 2, ...base(where), data: { name: 'action', options } });
  };
  const click = (customId: string, values?: string[], where: Where = {}) => {
    resetInteractionLimits();
    return fake.interact(endpoint(), {
      type: 3, ...base(where), message: { id: '1800000000000000001', flags: 64 },
      data: { custom_id: customId, component_type: values ? 3 : 2, ...values && { values } },
    });
  };
  const autocomplete = (options: any[], where: Where = {}) => fake.interact(endpoint(), {
    type: 4, ...base(where), data: { name: 'action', options },
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
  const text = (message: any) => JSON.stringify(message);
  const components = (message: any): any[] => (message?.components || []).flatMap((row: any) => row.components || []);
  const selects = (message: any) => components(message).filter(component => component.type === 3);
  const buttons = (message: any) => components(message).filter(component => component.type === 2);
  const buttonNamed = (message: any, label: string) => {
    const found = buttons(message).find(button => button.label === label);
    if (!found) throw new Error(`no button "${label}" in ${text(buttons(message).map(button => button.label))}`);
    return found.custom_id as string;
  };
  const optionValues = (message: any) => selects(message).flatMap(select => select.options.map((item: any) => item.value));
  /** The menu an answer shows: a new message (4) or the menu updated (7) */
  const menuOf = (answer: any) => {
    if (answer?.type !== 4 && answer?.type !== 7) throw new Error(`no menu: ${text(answer)}`);
    return answer.data;
  };
  /** The result posted from a menu: its message closed, the card as a new message */
  const posted = async (token: string) => ({
    card: await waitFor(() => fake.interactions.get(token)?.followUps[0], 'the result'),
    closed: await waitFor(() => fake.interactions.get(token)?.edits.at(-1), 'the menu closed'),
  });
  const edited = (token: string) => waitFor(() => fake.interactions.get(token)?.edits.at(-1), 'the reply');
  const damageOf = async (propId: string) => (await CreatureProperties.findOneAsync(propId) as any)?.damage || 0;
  const valueOf = async (propId: string) => (await CreatureProperties.findOneAsync(propId) as any)?.value;
  const logs = (creatureId: string) => CreatureLogs.find({ creatureId }, { sort: { date: 1 } }).fetchAsync() as Promise<any[]>;
  const actionsLeft = () => EngineActions.find({ creatureId: ariaId }).countAsync();
  const sessionsLeft = () => DiscordActionSessions.find({}).countAsync();
  const endFight = () => CreatureFolders.updateAsync(folderId, { $unset: { initiative: 1 } });
  /**
   * Runs `run` with the actions inserted meanwhile given a seed of the test's
   * whose first two d20s are neither a 1 nor a 20: an attack then hits as its
   * total says. The click that inserts the action runs it too, now that no
   * question comes between: insertAction's own secret is replaced while it
   * runs
   */
  let steadySeed: string | undefined;
  async function withSteadySeed<T>(run: () => Promise<T>): Promise<T> {
    for (let i = 0; !steadySeed; i += 1) {
      const seed = `steady-seed-${i}`;
      if ([0, 1].every(position => seededDie(seed, position, 20) > 1 && seededDie(seed, position, 20) < 20)) steadySeed = seed;
    }
    const secret = Random.secret;
    (Random as any).secret = () => steadySeed;
    try {
      return await run();
    } finally {
      (Random as any).secret = secret;
    }
  }

  describe('the flow', function () {
    it('during a fight, opens the target menu, then runs the attack as the sheet does, never asking its advantage, and posts it', async function () {
      const first = await command([option('action', longswordId), option('character', ariaId)]);
      const menu = menuOf(first.answer);
      assert.equal(first.answer.type, 4);
      assert.equal(menu.flags, 64, 'for its user alone');
      assert.include(menu.content, 'Longsword');
      assert.include(menu.content, 'Choose its target');
      assert.deepEqual(optionValues(menu), [ariaId, goblinId], 'the actor first, then in initiative order');
      assert.include(text(selects(menu)[0].options), 'monster');
      assert.deepInclude(buttons(menu).map(button => button.label), 'No target');
      assert.notInclude(text(buttons(menu)), 'Target Goblin', 'nothing preselected the first time');
      // The goblin: no advantage asked, the attack runs
      const rolled = await withSteadySeed(() => click(selects(menu)[0].custom_id, [goblinId]));
      assert.equal(rolled.answer.type, 7, 'the menu updated');
      assert.include(rolled.answer.data.content, 'Longsword: on its way');
      assert.lengthOf(components(rolled.answer.data), 0, 'no second click');
      const { card, closed } = await posted(rolled.token);
      assert.include(closed.content, 'the result is posted in the channel');
      assert.notOk((card.flags ?? 0) & 64, 'public');
      assert.equal(card.flags & (1 << 15), 1 << 15, 'the card of D3');
      assert.include(text(card), '**Aria**');
      assert.include(text(card), 'Longsword');
      assert.include(text(card), 'Hit!');
      assert.notInclude(text(card), 'Advantage', 'the sheet suggests none for it');
      assert.include(text(card), '**5** slashing damage', 'the damage dealt');
      assert.notInclude(text(card), '70', 'never the goblin\'s hit points');
      assert.equal(await damageOf(goblinHpId), 5, 'applied');
      assert.lengthOf(await logs(ariaId), 1);
      assert.equal(await actionsLeft(), 0);
      assert.equal(await sessionsLeft(), 0);
      // The next time: its last target preselected
      const again = menuOf((await command([option('action', longswordId), option('character', ariaId)])).answer);
      assert.include(buttons(again).map(button => button.label), 'Target Goblin');
      assert.isTrue(selects(again)[0].options.find((item: any) => item.value === goblinId).default);
      const preselected = await withSteadySeed(() => click(buttonNamed(again, 'Target Goblin')));
      assert.include(preselected.answer.data.content, 'on its way');
      assert.include(text((await posted(preselected.token)).card), 'Hit!');
      assert.equal(await damageOf(goblinHpId), 10);
    });

    it('rolls with the advantage the sheet suggests, unless the advantage option says otherwise', async function () {
      await endFight();
      const run = async (options: any[]) => {
        const { answer, token } = await withSteadySeed(() => command([
          option('action', 'Reckless Strike'), option('target', goblinId), option('character', ariaId), ...options,
        ]));
        assert.deepEqual(answer, { type: 5 }, 'nothing asked: the reply is the result');
        return text(await edited(token));
      };
      assert.include(await run([]), 'Hit! (Advantage)', 'its effect, as on the sheet');
      assert.include(await run([option('advantage', -1, 4)]), 'Hit! (Disadvantage)');
      const normal = await run([option('advantage', 0, 4)]);
      assert.include(normal, 'Hit!');
      assert.notInclude(normal, 'Advantage');
      // An attack the sheet gives none, with the option
      const longsword = await withSteadySeed(() => command([
        option('action', longswordId), option('target', goblinId), option('character', ariaId), option('advantage', 1, 4),
      ]));
      assert.include(text(await edited(longsword.token)), 'Hit! (Advantage)');
      assert.lengthOf(await logs(ariaId), 4);
    });

    it('an action on its creature alone takes no target, even named', async function () {
      const self = await command([option('action', 'Dash'), option('target', goblinId), option('character', ariaId)]);
      assert.deepEqual(self.answer, { type: 5 }, 'no menu, no refusal');
      await edited(self.token);
      const [entry] = await logs(ariaId);
      assert.notInclude(text(entry), goblinId);
      assert.equal(await damageOf(goblinHpId), 0);
    });

    it('outside a fight: the target option, the spell slot chosen, the slot spent', async function () {
      await endFight();
      const first = await command([option('action', 'sacred flame'), option('target', 'Goblin'), option('character', ariaId)]);
      const menu = menuOf(first.answer);
      assert.include(menu.content, 'Cast it with which spell slot?');
      const [slots] = selects(menu);
      assert.deepEqual(slots.options.map((item: any) => item.value), [slot1Id, slot2Id]);
      assert.equal(slots.options[0].description, 'Level 1: 2 of 2 left');
      assert.isTrue(slots.options[0].default, 'the lowest, as the cast dialog');
      assert.equal(buttons(menu)[0].label, 'Cast: Level 1 slots');
      const cast = await click(slots.custom_id, [slot2Id]);
      assert.equal(cast.answer.type, 7, 'a saving throw asks nothing more');
      const { card } = await posted(cast.token);
      assert.include(text(card), 'Casting using a level 2 spell slot');
      assert.match(text(card), /Goblin · (Failed|Successful) save/, 'its result alone');
      assert.equal(await valueOf(slot2Id), 0, 'its level 2 slot spent');
      assert.equal(await valueOf(slot1Id), 2);
      const [entry] = await logs(ariaId);
      assert.deepEqual(entry.content.find((line: any) => line.targetIds?.includes(goblinId))?.targetIds, [goblinId]);
      assert.deepEqual(
        entry.content.find((line: any) => line.name === 'Casting using a level 2 spell slot')?.i18n,
        { name: { key: 'logs.castWithSlot', params: { level: 2 } } }, 'in the reader\'s language',
      );
    });

    it('asks the action\'s own choice and applies the one picked', async function () {
      const first = await command([option('action', 'Cunning Choice'), option('character', ariaId)]);
      const menu = menuOf(first.answer);
      assert.include(menu.content, 'Make your choice');
      const [choice] = selects(menu);
      assert.deepEqual(choice.options.map((item: any) => item.label), ['Went left', 'Went right']);
      assert.include(buttons(menu).map(button => button.label), 'No choice');
      // Something it did not offer
      assert.include((await click(choice.custom_id, [longswordId])).answer.data.content, 'no longer current');
      const picked = await click(choice.custom_id, [choice.options[1].value]);
      const { card } = await posted(picked.token);
      assert.include(text(card), 'Went right');
      assert.notInclude(text(card), 'Went left');
    });

    it('chooses the ammunition as the sheet does, keeps it on the action, and spends it', async function () {
      await endFight();
      const first = await command([option('action', 'Shortbow'), option('target', goblinId), option('character', ariaId)]);
      const menu = menuOf(first.answer);
      assert.include(menu.content, 'Which ammunition?');
      assert.deepEqual(optionValues(menu), [arrowsId, silverId]);
      assert.deepEqual(buttons(menu).map(button => button.label), ['Cancel'], 'none chosen yet');
      const rolled = await click(selects(menu)[0].custom_id, [silverId]);
      assert.include(rolled.answer.data.content, 'on its way');
      await posted(rolled.token);
      const shortbow = await CreatureProperties.findOneAsync(shortbowId) as any;
      assert.equal(shortbow.resources.itemsConsumed[0].itemId, silverId, 'kept, as the sheet keeps it');
      assert.equal((await CreatureProperties.findOneAsync(silverId) as any).quantity, 4);
      assert.equal((await CreatureProperties.findOneAsync(arrowsId) as any).quantity, 20);
      // The next time: the silver arrows offered first
      const again = menuOf((await command([option('action', 'Shortbow'), option('target', goblinId), option('character', ariaId)])).answer);
      assert.include(buttons(again).map(button => button.label), 'Use: Silver arrows');
    });

    it('answers with the result itself an action that asks nothing: public, or for its user alone with secret', async function () {
      const open = await command([option('action', 'Dash'), option('character', ariaId)]);
      assert.deepEqual(open.answer, { type: 5 }, 'deferred, public');
      const card = await edited(open.token);
      assert.include(text(card), 'Dashed');
      assert.equal(card.flags & (1 << 15), 1 << 15);
      const hidden = await command([option('action', 'Dash'), option('character', ariaId), option('secret', true, 5)]);
      assert.deepEqual(hidden.answer, { type: 5, data: { flags: 64 } });
      assert.include(text(await edited(hidden.token)), 'Dashed');
      assert.lengthOf(await logs(ariaId), 2, 'both in the log');
    });

    it('with secret, posts the result after the menus for its user alone', async function () {
      const first = await command([option('action', longswordId), option('character', ariaId), option('secret', true, 5), option('advantage', 1, 4)]);
      const rolled = await withSteadySeed(() => click(selects(menuOf(first.answer))[0].custom_id, [goblinId]));
      const { card, closed } = await posted(rolled.token);
      assert.equal(card.flags & 64, 64, 'for its user alone');
      assert.include(closed.content, 'shown to you alone');
      assert.include(text(card), '(Advantage)');
    });

    it('several targets: ticked across the selects, confirmed; "All monsters"', async function () {
      // 30 more goblins of the game master's fight: two selects
      const goblins = Array.from({ length: 30 }, (_, i) => ({ _id: Random.id(), name: `Goblin ${i + 2}`, owner: gmId, type: 'monster' }));
      await Creatures.rawCollection().insertMany(goblins as any[]);
      await CreatureFolders.updateAsync(folderId, {
        $push: { creatures: { $each: goblins.map(goblin => goblin._id) } },
        $set: { initiative: { ...FIGHT, entries: [...FIGHT.entries, ...goblins.map((goblin, i) => ({ _id: `g${i}`, creatureId: goblin._id, initiative: 5, name: goblin.name }))] } },
      } as any);
      const menu = menuOf((await command([option('action', 'Mass Mending'), option('character', ariaId)])).answer);
      assert.deepEqual(selects(menu).map(select => select.options.length), [25, 7], '32 creatures');
      assert.deepEqual(selects(menu).map(select => select.min_values), [0, 0]);
      assert.deepEqual(buttons(menu).map(button => button.label), ['Confirm (0)', 'All monsters', 'All characters', 'No target', 'Cancel']);
      assert.isTrue(buttons(menu)[0].disabled);
      const [first, second] = selects(menu);
      const [, one, two] = first.options;
      const last = second.options.at(-1);
      const ticked = menuOf((await click(first.custom_id, [one.value, two.value])).answer);
      assert.include(ticked.content, `Ticked: ${one.label}, ${two.label}`);
      assert.deepEqual(selects(ticked)[0].options.filter((item: any) => item.default).map((item: any) => item.value), [one.value, two.value]);
      const more = menuOf((await click(selects(ticked)[1].custom_id, [last.value])).answer);
      assert.equal(buttons(more)[0].label, 'Confirm (3)');
      // The first select changed: its creatures as ticked now, the second's as they were
      const fewer = menuOf((await click(selects(more)[0].custom_id, [ariaId])).answer);
      assert.equal(buttons(fewer)[0].label, 'Confirm (2)');
      const confirmed = await click(buttonNamed(fewer, 'Confirm (2)'));
      await posted(confirmed.token);
      const runWith = async () => (await DiscordActionTargets.findOneAsync(`${playerId}:${blessId}`))?.targetIds;
      assert.sameMembers(await runWith(), [ariaId, last.value], 'run on those two');
      // All the monsters at once
      const all = menuOf((await command([option('action', 'Mass Mending'), option('character', ariaId)])).answer);
      assert.equal(buttons(all)[0].label, 'Confirm (2)', 'its last targets preselected');
      const everyone = await click(buttonNamed(all, 'All monsters'));
      await posted(everyone.token);
      assert.sameMembers(await runWith(), [goblinId, ...goblins.map(goblin => goblin._id)]);
      assert.lengthOf(await logs(ariaId), 2);
    });

    it('slower than Discord waits: deferred, then the menus and the result edited in', async function () {
      setActionAnswerBudget(0);
      try {
        const first = await command([option('action', longswordId), option('character', ariaId)]);
        assert.deepEqual(first.answer, { type: 5, data: { flags: 64 } }, 'for its user alone, its menu to come');
        const menu = await edited(first.token);
        assert.include(menu.content, 'Choose its target');
        assert.notOk((menu.flags ?? 0) & 64, 'an edit keeps what the deferral said');
        const { rolled, card, closed } = await withSteadySeed(async () => {
          const clicked = await click(selects(menu)[0].custom_id, [goblinId]);
          return { rolled: clicked, ...await posted(clicked.token) };
        });
        assert.deepEqual(rolled.answer, { type: 6 }, 'the menu closed later');
        assert.include(closed.content, 'the result is posted in the channel');
        assert.include(text(card), 'Hit!');
        assert.notOk((card.flags ?? 0) & 64);
        // A click whose next menu comes late: edited in its place
        const feint = await command([option('action', feintId), option('character', ariaId)]);
        const feintMenu = await edited(feint.token);
        const toChoice = await click(selects(feintMenu)[0].custom_id, [goblinId]);
        assert.deepEqual(toChoice.answer, { type: 6 });
        const choiceMenu = await edited(toChoice.token);
        assert.include(choiceMenu.content, 'Make your choice');
        const [choices] = selects(choiceMenu);
        const picked = await click(choices.custom_id, [choices.options[1].value]);
        assert.deepEqual(picked.answer, { type: 6 });
        assert.include(text((await posted(picked.token)).card), 'Low');
        // An action that asks nothing, slower than Discord waits: posted the same way
        const dash = await command([option('action', 'Dash'), option('character', ariaId)]);
        assert.deepEqual(dash.answer, { type: 5, data: { flags: 64 } });
        const dashed = await posted(dash.token);
        assert.include(text(dashed.card), 'Dashed');
        assert.notOk((dashed.card.flags ?? 0) & 64, 'public');
      } finally {
        setActionAnswerBudget();
      }
    });

    it('in French: the menus and the result in the interaction\'s language', async function () {
      const menu = menuOf((await command([option('action', longswordId), option('character', ariaId)], { locale: 'fr' })).answer);
      assert.include(menu.content, 'Choisissez sa cible.');
      assert.include(buttons(menu).map(button => button.label), 'Sans cible');
      assert.include(text(selects(menu)[0].options), 'monstre');
      const rolled = await withSteadySeed(() => click(selects(menu)[0].custom_id, [goblinId], { locale: 'fr' }));
      assert.include(rolled.answer.data.content, 'Longsword\u00A0: en cours…');
      const { card, closed } = await posted(rolled.token);
      assert.include(closed.content, 'le résultat est publié dans le salon');
      assert.include(text(card), 'Touché');
    });

    it('a game master\'s monster: for its game master alone', async function () {
      const first = await command([option('action', 'Scimitar'), option('character', goblinId)], { user: GM, channel: PARTY_CHANNEL });
      const menu = menuOf(first.answer);
      assert.deepEqual(optionValues(menu), [goblinId, ariaId]);
      const rolled = await withSteadySeed(() => click(selects(menu)[0].custom_id, [ariaId], { user: GM, channel: PARTY_CHANNEL }));
      const { card } = await posted(rolled.token);
      assert.equal(card.flags & 64, 64, 'never public');
      assert.equal(await damageOf(ariaHpId), 2);
    });

    it('posts the entry once in its channel: the reply there, never the webhook too', async function () {
      const connected = { id: '1700000000000000001', token: 'connected-token' };
      await ConnectedWebhooks.rawCollection().insertOne({
        _id: connected.id, webhookId: connected.id, token: connected.token, channelId: PARTY_CHANNEL, guildId: GUILD, createdAt: new Date(),
      });
      const done = await command([option('action', 'Dash'), option('character', ariaId)], { channel: PARTY_CHANNEL });
      await edited(done.token);
      await discordIntakeIdle();
      await sender.idle();
      assert.lengthOf(fake.requests.filter(request => request.webhookId === connected.id && request.method === 'POST'), 0);
      // Elsewhere, the party's channel gets it from its webhook
      const elsewhere = await command([option('action', 'Dash'), option('character', ariaId)]);
      await edited(elsewhere.token);
      await discordIntakeIdle();
      await sender.idle();
      assert.lengthOf(fake.requests.filter(request => request.webhookId === connected.id && request.method === 'POST'), 1);
      // Secret, elsewhere: its user alone sees it, the party's channel gets nothing
      const secret = await command([option('action', 'Dash'), option('character', ariaId), option('secret', true, 5)]);
      await edited(secret.token);
      await discordIntakeIdle();
      await sender.idle();
      assert.lengthOf(fake.requests.filter(request => request.webhookId === connected.id && request.method === 'POST'), 1);
    });
  });

  describe('as the browser plays it', function () {
    it('never resolves a hidden monster to ask a question: a choice on a hit alone is left unmade, as after the browser', async function () {
      const first = await command([option('action', 'Ambush'), option('character', ariaId)]);
      const rolled = await withSteadySeed(() => click(selects(menuOf(first.answer))[0].custom_id, [goblinId]));
      assert.include(rolled.answer.data.content, 'on its way', 'no choice asked: the browser cannot see the hit');
      await posted(rolled.token);
      const [entry] = await logs(ariaId);
      assert.include(entry.content.map((line: any) => line.name), 'Hit!', 'the server resolved it');
      assert.exists(entry.content.find((line: any) => line.i18n?.name?.key === 'logs.choiceNotMade'));
      // On a character the player may read, the hit is seen and the choice asked
      const self = await command([option('action', 'Ambush'), option('character', ariaId)]);
      const asked = await withSteadySeed(() => click(selects(menuOf(self.answer))[0].custom_id, [ariaId]));
      assert.include(menuOf(asked.answer).content, 'Make your choice');
    });

    it('its dry run writes nothing, and a question after a roll shows its dice as drawDice does', async function () {
      const actionId = await insertAction._execute(invocationOf(playerId), {
        action: { creatureId: ariaId, task: { prop: { _id: feintId }, targetIds: [goblinId] }, results: [], taskCount: 0 },
      });
      const snapshot = async () => text(await Promise.all([
        CreatureProperties.find({ 'root.id': { $in: [ariaId, goblinId] } }, { sort: { _id: 1 } }).fetchAsync(),
        Creatures.find({ _id: { $in: [ariaId, goblinId] } }, { sort: { _id: 1 } }).fetchAsync(),
        CreatureVariables.find({ _creatureId: { $in: [ariaId, goblinId] } }, { sort: { _id: 1 } }).fetchAsync(),
        CreatureLogs.find({}, { sort: { _id: 1 } }).fetchAsync(),
        EngineActions.find({}, { sort: { _id: 1 } }).fetchAsync(),
      ]));
      const before = await snapshot();
      // Its advantage decided, never asked: the sheet's suggestion, else the option's
      const suggested = await dryRun(actionId, []);
      assert.equal(suggested.question.kind, 'choose', 'the choice, the first question');
      assert.deepEqual(suggested.question.choices.map((item: any) => item.name), ['High', 'Low']);
      assert.deepEqual(suggested.decided, [{ kind: 'advantage', value: 0 }]);
      assert.equal(suggested.dice, 1);
      const choice = await dryRun(actionId, [], { advantage: 1 });
      assert.deepEqual(choice.decided, [{ kind: 'advantage', value: 1 }]);
      assert.equal(choice.dice, 2, 'two d20s with advantage');
      const done = await dryRun(actionId, [{ kind: 'advantage', value: 1 }, { kind: 'choose', value: [choice.question.choices[0]._id] }]);
      assert.deepEqual(done, { dice: 2, decided: [] }, 'the decisions given replayed, nothing left to ask');
      assert.equal(await snapshot(), before, 'nothing written');
      // Through the menus: the choice follows the roll, which is then shown
      const first = await command([option('action', 'Feint'), option('character', ariaId)]);
      const chose = await click(selects(menuOf(first.answer))[0].custom_id, [goblinId]);
      assert.include(menuOf(chose.answer).content, 'Make your choice');
      const session = await DiscordActionSessions.findOneAsync({});
      assert.equal((await EngineActions.findOneAsync(session.actionId) as any).revealedCursor, 1);
      // Given up after that: logged as abandoned, as from the browser
      const cancelled = await click(buttonNamed(menuOf(chose.answer), 'Cancel'));
      assert.include(cancelled.answer.data.content, 'You gave up Feint');
      assert.equal(await actionsLeft(), 0);
      assert.equal(await sessionsLeft(), 0);
      assert.exists((await logs(ariaId)).find(log => log.content[0]?.i18n?.name?.key === 'logs.actionAbandoned'));
    });
  });

  describe('the refusals, for their user alone, in their language', function () {
    async function refused(options: any[], where: Where = {}) {
      const { answer } = await command(options, where);
      assert.equal(answer.type, 4, text(answer));
      assert.equal(answer.data.flags, 64);
      // Only the link to the account's settings, for an unlinked account
      assert.lengthOf((answer.data.components || []).filter((row: any) => !text(row).includes('"style":5')), 0);
      return answer.data.content as string;
    }

    it('an unlinked account, no character, an unknown action', async function () {
      assert.include(await refused([option('action', 'Longsword')], { user: STRANGER, locale: 'fr' }), 'compte DiceCloud');
      assert.include(await refused([option('action', 'Longsword')]), 'Which character?');
      assert.include(await refused([option('action', 'Juggle'), option('character', ariaId)]), 'Aria has no action or spell “Juggle”');
      assert.include(await refused([option('action', 'Juggle'), option('character', ariaId)], { locale: 'fr' }),
        'Aria n\'a pas d\'action ni de sort « Juggle »');
      assert.lengthOf(await logs(ariaId), 0);
      assert.equal(await sessionsLeft(), 0);
    });

    it('a target not allowed: the game master\'s switch off, or outside the party', async function () {
      await endFight();
      await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: false } });
      assert.include(await refused([option('action', 'Longsword'), option('target', 'Goblin'), option('character', ariaId)]),
        'You may not target Goblin with Longsword');
      assert.include(await refused([option('action', 'Longsword'), option('target', goblinId), option('character', ariaId)], { locale: 'fr' }),
        'Vous ne pouvez pas cibler Goblin avec Longsword');
      assert.include(await refused([option('action', 'Longsword'), option('target', 'Stray wolf'), option('character', ariaId)]),
        'No creature you may target is named “Stray wolf”');
      assert.include(await refused([option('action', 'Longsword'), option('target', strayId), option('character', ariaId)]),
        'No creature you may target');
      assert.equal(await damageOf(goblinHpId), 0);
      assert.equal(await actionsLeft(), 0);
    });

    it('not enough resources: no use left, no spell slot left, no ammunition', async function () {
      assert.include(await refused([option('action', 'Second Wind'), option('character', ariaId)]), 'Aria has no uses of Second Wind left');
      await CreatureProperties.rawCollection().updateMany({ _id: { $in: [slot1Id, slot2Id] } }, { $set: { value: 0 } });
      await endFight();
      assert.include(await refused([option('action', 'Sacred Flame'), option('target', goblinId), option('character', ariaId)]),
        'Aria has no spell slot left to cast Sacred Flame');
      await CreatureProperties.removeAsync({ _id: { $in: [arrowsId, silverId] } });
      assert.include(await refused([option('action', 'Shortbow'), option('target', goblinId), option('character', ariaId)]),
        'Aria has no ammunition for Shortbow');
      // During a fight too: before its target menu
      await CreatureFolders.updateAsync(folderId, { $set: { initiative: FIGHT } });
      assert.include(await refused([option('action', 'Shortbow'), option('character', ariaId)]), 'Aria has no ammunition for Shortbow');
      assert.equal(await actionsLeft(), 0);
      assert.equal(await sessionsLeft(), 0);
    });
  });

  describe('every click checked again', function () {
    async function targetMenu(where: Where = {}, action = longswordId) {
      return menuOf((await command([option('action', action), option('character', ariaId)], where)).answer);
    }

    it('an expired session, someone else\'s menu, an old menu, two clicks at once', async function () {
      const menu = await targetMenu({}, feintId);
      const [select] = selects(menu);
      assert.include((await click(select.custom_id, [goblinId], { user: OTHER })).answer.data.content, 'someone else\'s');
      // A creature of no party of Aria's, which the menu never offered
      assert.include((await click(select.custom_id, [strayId])).answer.data.content, 'no longer current');
      const [first, second] = await Promise.all([click(select.custom_id, [goblinId]), click(select.custom_id, [goblinId])]);
      const answers = [first.answer, second.answer];
      assert.lengthOf(answers.filter(answer => answer.type === 7), 1, 'one moves on');
      assert.lengthOf(answers.filter(answer => answer.type === 4 && answer.data.content.includes('no longer current')), 1);
      // The same menu again: no longer current
      assert.include((await click(select.custom_id, [goblinId])).answer.data.content, 'no longer current');
      // A value the menu never offered, an answer it never asked (a roll's advantage), a custom_id not DiceCloud's
      const choiceMenu = (answers.find(answer => answer.type === 7) as any).data;
      assert.include(choiceMenu.content, 'Make your choice');
      const [choices] = selects(choiceMenu);
      assert.include((await click(choices.custom_id, [goblinId])).answer.data.content, 'no longer current');
      assert.include((await click(choices.custom_id.replace(/:csel:0$/, ':adv:1'))).answer.data.content, 'no longer current');
      assert.include((await click('dc:act:nothing')).answer.data.content, 'no longer current');
      // Fifteen minutes later
      await DiscordActionSessions.updateAsync({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await click(choices.custom_id, [choices.options[0].value]);
      assert.equal(expired.answer.type, 7);
      assert.include(expired.answer.data.content, 'expired');
      assert.lengthOf(expired.answer.data.components, 0);
      // Its dice were shown before its choice: abandoned, as from the browser; nothing else
      assert.deepEqual((await logs(ariaId)).map(log => log.content[0]?.i18n?.name?.key), ['logs.actionAbandoned']);
      assert.equal(await damageOf(goblinHpId), 0);
      assert.equal(await actionsLeft(), 0, 'its action gone with it');
    });

    it('the game master\'s switch turned off meanwhile: at the target, and once it is chosen', async function () {
      const menu = await targetMenu({}, feintId);
      await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: false } });
      const refused = await click(selects(menu)[0].custom_id, [goblinId]);
      assert.equal(refused.answer.type, 7, 'the menu offered again');
      assert.include(refused.answer.data.content, 'You may not target Goblin with Feint');
      assert.deepEqual(optionValues(refused.answer.data), [ariaId], 'without the goblin');
      assert.equal(await actionsLeft(), 0);
      await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: true } });
      const targeted = await click(selects(refused.answer.data)[0].custom_id, [goblinId]);
      await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: false } });
      const [choices] = selects(menuOf(targeted.answer));
      const late = await click(choices.custom_id, [choices.options[0].value]);
      assert.equal(late.answer.type, 7);
      assert.include(late.answer.data.content, 'You may not target Goblin with Feint');
      assert.lengthOf(late.answer.data.components, 0);
      assert.equal(await damageOf(goblinHpId), 0);
      assert.deepEqual((await logs(ariaId)).map(log => log.content[0]?.i18n?.name?.key), ['logs.actionAbandoned'], 'nothing run');
      assert.equal(await actionsLeft(), 0, 'its action removed');
      assert.equal(await sessionsLeft(), 0);
    });

    it('the action replaced by another of the character\'s, the action gone from the sheet, the account unlinked, a cancel', async function () {
      const targeted = await click(selects(await targetMenu({}, feintId))[0].custom_id, [goblinId]);
      // The sheet plays another action meanwhile
      await insertAction._execute(invocationOf(playerId), {
        action: { creatureId: ariaId, task: { prop: { _id: dashId }, targetIds: [] }, results: [], taskCount: 0 },
      });
      const [choices] = selects(menuOf(targeted.answer));
      const replaced = await click(choices.custom_id, [choices.options[0].value]);
      assert.include(replaced.answer.data.content, 'Another action of Aria, from the sheet or Discord, replaced this one');
      // The action removed from the sheet
      const menu = await targetMenu();
      await CreatureProperties.updateAsync(longswordId, { $set: { removed: true } });
      // As the creature's observers do, a moment later
      await reloadCachedProperties(ariaId);
      const gone = await click(selects(menu)[0].custom_id, [goblinId]);
      assert.include(gone.answer.data.content, 'no longer on Aria\'s sheet');
      await CreatureProperties.updateAsync(longswordId, { $unset: { removed: 1 } });
      await reloadCachedProperties(ariaId);
      // The Discord account now linked to another DiceCloud account
      const unlinked = await targetMenu();
      await Meteor.users.updateAsync(playerId, { $unset: { discordAccount: 1 } });
      await Meteor.users.updateAsync(otherId, { $set: { discordAccount: { id: PLAYER, username: 'Aria' } } });
      const relinked = await click(selects(unlinked)[0].custom_id, [goblinId]);
      assert.include(relinked.answer.data.content, 'You can no longer change this character');
      assert.equal(await sessionsLeft(), 0);
      // The Feint replaced after its dice were shown: abandoned; nothing ran
      assert.deepEqual((await logs(ariaId)).map(log => log.content[0]?.i18n?.name?.key), ['logs.actionAbandoned']);
    });
  });

  describe('autocompletion', function () {
    it('the actions and spells, with their kind, level and cost; the targets as the sheet offers them', async function () {
      const actions = (await autocomplete([{ ...option('action', ''), focused: true }, option('character', ariaId)])).answer.data.choices;
      const named = (value: string) => actions.find((choice: any) => choice.value === value)?.name;
      assert.equal(named(longswordId), 'Longsword — Action');
      assert.equal(named(flameId), 'Sacred Flame — level 1 spell');
      assert.equal(named(secondWindId), 'Second Wind — Action · uses: 0/1 · not enough resources');
      assert.equal(named(shortbowId), 'Shortbow — Action · 1 ammunition · not enough resources', 'no arrows chosen yet, two of its tag: never the tag');
      const french = (await autocomplete([{ ...option('action', 'flam'), focused: true }, option('character', ariaId)], { locale: 'fr' })).answer.data.choices;
      assert.deepEqual(french, [{ name: 'Sacred Flame — sort de niveau 1', value: flameId }]);
      const frenchCosts = (await autocomplete([{ ...option('action', ''), focused: true }, option('character', ariaId)], { locale: 'fr' })).answer.data.choices;
      assert.equal(frenchCosts.find((choice: any) => choice.value === secondWindId)?.name, 'Second Wind — Action · utilisations\u00A0: 0/1 · ressources insuffisantes');
      assert.equal(frenchCosts.find((choice: any) => choice.value === shortbowId)?.name, 'Shortbow — Action · 1 munition · ressources insuffisantes');
      // The only item of its tag: its name
      await CreatureProperties.removeAsync(silverId);
      const one = (await autocomplete([{ ...option('action', 'shortbow'), focused: true }, option('character', ariaId)])).answer.data.choices;
      assert.deepEqual(one, [{ name: 'Shortbow — Action · 1 Arrows · not enough resources', value: shortbowId }]);
      const targets = async () => (await autocomplete([option('action', longswordId), { ...option('target', ''), focused: true }, option('character', ariaId)]))
        .answer.data.choices.map((choice: any) => choice.name);
      assert.deepEqual(await targets(), ['Aria (me)', 'Goblin (monster)']);
      await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: false } });
      assert.deepEqual(await targets(), ['Aria (me)'], 'the game master\'s switch');
      const onSelf = await autocomplete([option('action', dashId), { ...option('target', ''), focused: true }, option('character', ariaId)]);
      assert.deepEqual(onSelf.answer.data.choices, [], 'an action on its creature alone');
      assert.deepEqual((await autocomplete([{ ...option('action', ''), focused: true }], { user: STRANGER })).answer.data.choices, []);
    });

    it('more than 25 actions: the first 25, and typing finds the others', async function () {
      const extra = propsFromForest(Array.from({ length: 30 }, (_, i) => ({
        type: 'action', name: `Extra move ${i + 1}`, target: 'self', actionType: 'bonus',
      })) as any, ariaId);
      for (const prop of extra) await CreatureProperties.insertAsync({ ...prop, left: prop.left + 1000, right: prop.right + 1000 } as any);
      const all = (await autocomplete([{ ...option('action', ''), focused: true }, option('character', ariaId)])).answer.data.choices;
      assert.lengthOf(all, 25);
      const typed = (await autocomplete([{ ...option('action', 'move 30'), focused: true }, option('character', ariaId)])).answer.data.choices;
      assert.deepEqual(typed.map((choice: any) => choice.name), ['Extra move 30 — Bonus action']);
      // And run by its name
      const run = await command([option('action', 'extra move 30'), option('character', ariaId)]);
      assert.deepEqual(run.answer, { type: 5 });
    });
  });
});
