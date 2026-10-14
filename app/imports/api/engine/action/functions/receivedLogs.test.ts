import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import EngineActions from '/imports/api/engine/action/EngineActions';
import {
  allLogContent, createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById, type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { concentrationDc } from '/imports/api/engine/action/applyProperties/applyDamageProperty';
import { about, openAs } from '/imports/api/utility/ddpClient.testFn';
import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { setPartyWebhook } from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import { get } from 'lodash';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatureFolders/server/publications/characterParties');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/startup/server/publicationStrategies');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * Phase 2.1 of the monsters: the game master's monsters act on the party's
 * characters. The character's log gets an entry of its own ("Goblin 1 →
 * you"), with what concerns it as its player may read it: the totals, never
 * the monster's bonuses, formulas or stat block text; its own damage triggers
 * fire on its behalf; a creature that concentrates is reminded of its save,
 * whoever hurt it.
 *
 * The goblin carries distinctive numbers, which no player may ever read:
 * its attack bonus 6543, its damage formula 1d4 + 9876, its hit points 4321,
 * its stat block's text SECRET-SUMMARY, its note's SECRET-NOTE.
 */

// The game master, the players of Lyra and Aria
const [gmId, playerId, otherPlayerId] = getRandomIds(3);
const [lyraId, ariaId, goblinId, wolfId, folderId] = getRandomIds(5);
const [
  scimitarId, breathId, lyraHpId, healCountId, cureId, gmHeroId, gmHeroStaffId, wolfBiteId, chatterId,
] = getRandomIds(9);

const CANARIES = ['6543', '9876', '1d4', '4321', 'SECRET', 'Uses left', 'usesLeft'];

const hitPoints = (_id: string | undefined, total: number) => ({
  ...(_id && { _id }), type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
  baseValue: { calculation: String(total) },
}) as any;
const armor = (value: number) => ({
  type: 'attribute', attributeType: 'stat', name: 'Armor Class', variableName: 'armor', baseValue: { calculation: String(value) },
}) as any;
const dexteritySave = (bonus: number) => ({
  type: 'skill', skillType: 'save', name: 'Dexterity Save', variableName: 'dexteritySave',
  baseValue: { calculation: String(bonus) },
}) as any;

// A character of the party: concentrating, and with a trigger on its hit
// points that fires once healed, and counts the heals
const lyra: TestCreature = {
  _id: lyraId, name: 'Lyra', owner: playerId, type: 'pc', writers: [gmId],
  props: [
    hitPoints(lyraHpId, 20000),
    armor(5),
    dexteritySave(2),
    { type: 'toggle', name: 'Concentration', variableName: 'concentration', enabled: true } as any,
    {
      _id: healCountId, type: 'attribute', attributeType: 'utility', name: 'Heals', variableName: 'healCount',
      baseValue: { calculation: '10' },
    } as any,
    {
      type: 'trigger', name: 'Heal counter', event: 'damageProperty', timing: 'after', targetTags: ['hitPoints'],
      condition: { calculation: '~healing > 0' }, description: { text: 'Healed by {~healing}' },
      children: [{
        type: 'adjustment', target: 'self', stat: 'healCount', operation: 'increment', amount: { calculation: '1' },
      }],
    } as any,
  ],
};

const aria: TestCreature = {
  _id: ariaId, name: 'Aria', owner: otherPlayerId, type: 'pc', writers: [gmId],
  props: [
    hitPoints(undefined, 20000),
    armor(5),
    dexteritySave(1),
    {
      _id: cureId, type: 'action', name: 'Cure Wounds', target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '7' } }],
    } as any,
  ],
};

const goblin: TestCreature = {
  _id: goblinId, name: 'Goblin 1', owner: gmId, type: 'monster',
  props: [
    hitPoints(undefined, 4321),
    armor(13),
    {
      _id: scimitarId, type: 'action', name: 'Scimitar', target: 'singleTarget',
      attackRoll: { calculation: '6543' }, uses: { calculation: '9' },
      summary: { text: 'SECRET-SUMMARY: +6543 to hit, 1d4 + 9876 slashing damage.' },
      children: [{
        type: 'branch', branchType: 'hit',
        children: [
          { type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '1d4 + 9876' } },
          { type: 'note', name: 'Grappled', summary: { text: 'SECRET-NOTE: escape DC 9876' } },
          { type: 'roll', name: 'Fury', variableName: 'fury', roll: { calculation: '1d4 + 9876' } },
        ],
      }],
    } as any,
    {
      _id: breathId, type: 'action', name: 'Fire Breath', target: 'multipleTargets',
      summary: { text: 'SECRET-SUMMARY: DC 15, 2d6 + 9876 fire damage' },
      children: [{
        type: 'savingThrow', name: 'Fire Breath', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        children: [{
          type: 'branch', branchType: 'failedSave',
          children: [{ type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '2d6 + 9876' } }],
        }],
      }],
    } as any,
  ],
};

// Another of the game master's monsters, and the game master's own character
const wolf: TestCreature = {
  _id: wolfId, name: 'Wolf', owner: gmId, type: 'monster',
  props: [
    hitPoints(undefined, 30),
    { _id: wolfBiteId, type: 'damage', target: 'target', damageType: 'piercing', amount: { calculation: '3' } } as any,
  ],
};
const gmHero: TestCreature = {
  _id: gmHeroId, name: 'Gandalf', owner: gmId, type: 'pc',
  props: [
    hitPoints(undefined, 50),
    { _id: gmHeroStaffId, type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '4' } } as any,
    // An action that says more than a log keeps
    {
      _id: chatterId, type: 'action', name: 'Long speech', target: 'self',
      children: Array.from({ length: 40 }, (_, i) => ({ type: 'note', name: `Line ${i + 1}` })),
    } as any,
  ],
};

const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } }) as Promise<any>;
const logCount = (creatureId: string) => CreatureLogs.find({ creatureId }).countAsync();
const text = (value: unknown) => JSON.stringify(value ?? null);
const names = (log: any) => (log?.content || []).map((line: any) => line.name);

async function act(propId: string, targetIds: string[]) {
  const action = await runActionById(propId, targetIds);
  await writeActionResults(action);
  return action;
}

async function setUp() {
  await removeAllCreaturesAndProps();
  await Meteor.users.rawCollection().insertMany([gmId, playerId, otherPlayerId].map((_id, i) => ({
    _id, createdAt: new Date(), username: `received-${i}-${_id}`,
  })) as any[]);
  // Joining a party made the game master an editor of its characters (writers)
  for (const creature of [lyra, aria, goblin, wolf, gmHero]) await createTestCreature(creature);
  await CreatureFolders.rawCollection().insertOne({
    _id: folderId, name: 'The table', owner: gmId, members: [playerId, otherPlayerId],
    creatures: [lyraId, ariaId, goblinId, wolfId, gmHeroId], order: 0,
  } as any);
}

async function tearDown() {
  const ids = [lyraId, ariaId, goblinId, wolfId, gmHeroId];
  await CreatureLogs.removeAsync({ creatureId: { $in: ids } });
  await EngineActions.removeAsync({ creatureId: { $in: ids } });
  await CreatureFolders.removeAsync(folderId);
  await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, otherPlayerId] } });
  await removeAllCreaturesAndProps();
}

if (Meteor.isServer) describe('A monster acting on a player\'s character: the character\'s own entry', function () {
  this.timeout(30000);
  before(setUp);
  after(tearDown);

  it('gets "Goblin 1 → you", with the totals and nothing of the monster\'s numbers', async function () {
    const action = await act(scimitarId, [lyraId]);
    const log = await latestLog(lyraId);
    assert.exists(log, 'the character has an entry of its own');
    assert.deepEqual(log.received, { fromCreatureId: goblinId, actionId: action._id });
    assert.equal(log.creatureName, 'Goblin 1');
    const [heading] = log.content;
    assert.equal(heading.name, 'Goblin 1 → you');
    assert.deepEqual(heading.i18n?.name, { key: 'logs.receivedFrom', params: { name: 'Goblin 1', target: 'Lyra' } });
    assert.includeMembers(names(log), ['Scimitar', 'Hit!', 'Damage', 'Grappled', 'Fury', 'Concentration']);
    const line = (name: string) => log.content.find((content: any) => content.name === name);
    // The test's dice: the d20 rolls 10, a d4 2
    assert.equal(line('Hit!').value, '**6553**', 'the attack\'s total, not its roll and bonus');
    assert.equal(line('Damage').value, '**9878** slashing damage', 'the damage dealt, not its formula');
    assert.equal(line('Fury').value, '**9878**', 'a roll\'s result alone');
    assert.notProperty(line('Scimitar'), 'value', 'the action\'s name, not its stat block');
    assert.notProperty(line('Grappled'), 'value', 'a note\'s name, not its text');
    // Its own hit points, whole
    assert.include(text(log.content), '−9878 Hit Points');
    for (const canary of CANARIES) assert.notInclude(text(log), canary);
    // Nothing of the views is stored
    assert.notInclude(text(log), 'targetView');
  });

  it('keeps the whole entry, uses left included, in the monster\'s own log, the game master\'s', async function () {
    const log = await latestLog(goblinId);
    for (const canary of ['6543', '1d4 + 9876', 'SECRET-SUMMARY', 'SECRET-NOTE', 'Uses left']) {
      assert.include(text(log), canary);
    }
    assert.notInclude(text(log), 'targetView');
    const usesLeft = log.content.find((line: any) => line.name === 'Uses left');
    assert.deepEqual(usesLeft.targetIds, [goblinId], 'the monster\'s uses concern the monster');
  });

  it('reminds a concentrating character of its saving throw, whoever damaged it', async function () {
    const log = await latestLog(lyraId);
    const reminder = log.content.find((line: any) => line.name === 'Concentration');
    assert.include(reminder.value, `DC **${concentrationDc(9878)}**`);
    assert.deepEqual(reminder.targetIds, [lyraId]);
    // After its hit points
    const reminderIndex = log.content.indexOf(reminder);
    const hitPointsIndex = log.content.findIndex((line: any) => line.value?.includes('Hit Points'));
    assert.isAbove(hitPointsIndex, 0);
    assert.isAbove(reminderIndex, hitPointsIndex);
  });

  it('gives each character in a breath its own saving throw and damage, and its own lines only', async function () {
    await act(breathId, [lyraId, ariaId]);
    const lyraLog = await latestLog(lyraId);
    const ariaLog = await latestLog(ariaId);
    for (const [log, bonus] of [[lyraLog, '+ 2'], [ariaLog, '+ 1']] as const) {
      assert.equal(names(log)[0], 'Goblin 1 → you');
      assert.lengthOf(log.content.filter((line: any) => line.name === 'Failed save'), 1, 'its own saving throw');
      assert.include(log.content.find((line: any) => line.name === 'Failed save').value, bonus, 'its own roll, whole');
      assert.include(names(log), 'Fire Breath', 'the DC\'s line, under the save\'s name');
      assert.include(text(log), 'DC **15**', 'the DC');
      assert.lengthOf(log.content.filter((line: any) => line.name === 'Damage'), 1, 'its own damage');
      assert.include(text(log), '9883** fire damage');
      for (const canary of CANARIES) assert.notInclude(text(log), canary);
    }
    // The monster's entry has both, a damage line each, naming whose they are
    // (phase 2.2)
    const goblinLog = await latestLog(goblinId);
    assert.deepEqual(goblinLog.content.filter((line: any) => / · Failed save$/.test(line.name)).map((line: any) => line.name),
      ['Lyra · Failed save', 'Aria · Failed save']);
    const damage = goblinLog.content.filter((line: any) => / · Damage$/.test(line.name));
    assert.deepEqual(damage.map((line: any) => line.name), ['Lyra · Damage', 'Aria · Damage']);
    assert.deepEqual(damage.map((line: any) => line.targetIds), [[lyraId], [ariaId]]);
  });

  it('fires the character\'s own damage triggers on its behalf, with ~healing in their scope', async function () {
    const before = (await CreatureProperties.findOneAsync(healCountId) as any).damage || 0;
    await act(cureId, [lyraId]);
    const healCount = await CreatureProperties.findOneAsync(healCountId) as any;
    assert.equal(healCount.damage, before + 1, 'the trigger\'s adjustment applied to the character');
    const log = await latestLog(lyraId);
    assert.equal(log.received.fromCreatureId, ariaId);
    assert.equal(names(log)[0], 'Aria → you');
    const trigger = log.content.find((line: any) => line.name === 'Heal counter');
    assert.exists(trigger, 'its trigger\'s line ends its entry');
    assert.equal(trigger.value, 'Healed by 7');
    // Another player's character: the lines whole
    assert.include(text(log), '+7 Hit Points');
    // Damage does not heal: the trigger's condition holds only for healing
    await act(scimitarId, [lyraId]);
    assert.equal((await CreatureProperties.findOneAsync(healCountId) as any).damage, before + 1);
    assert.notInclude(names(await latestLog(lyraId)), 'Heal counter');
  });

  it('gives no entry to a creature of the actor\'s owner, unless the actor is hidden from it', async function () {
    const before = await logCount(goblinId);
    await act(wolfBiteId, [goblinId]);
    assert.equal(await logCount(goblinId), before, 'the game master reads the wolf\'s entry');
    // Their own character's log, which the party's channel shows, gets its entry, without the monster's numbers
    await act(scimitarId, [gmHeroId]);
    const log = await latestLog(gmHeroId);
    assert.equal(names(log)[0], 'Goblin 1 → you');
    for (const canary of CANARIES) assert.notInclude(text(log), canary);
  });

  it('keeps an entry to the lines a log holds, saying how many more there were', async function () {
    const action = await runActionById(chatterId, []);
    assert.isAbove(allLogContent(action).length, 32, 'the action says more than a log keeps');
    await writeActionResults(action);
    const log = await latestLog(gmHeroId);
    assert.lengthOf(log.content, 32);
    assert.equal(log.content[0].name, 'Long speech');
    assert.equal(log.content[31].i18n?.value?.[0]?.key, 'logs.linesOmitted');
    assert.equal(log.content[31].value, 'And 10 more lines');
  });

  it('says it in English and French', function () {
    for (const key of ['logs.receivedFrom', 'logs.linesOmitted', 'discord.receivedFrom', 'targetPicker.errors.singleTarget']) {
      assert.isString(get(en, key), key);
      assert.isString(get(fr, key), key);
    }
    assert.equal(get(fr, 'logs.receivedFrom'), '{name} → vous');
  });
});

if (Meteor.isServer) describe('Single-target actions take one target', function () {
  this.timeout(30000);
  before(setUp);
  after(tearDown);

  const insert = (propId: string, targetIds: string[]) => (insertAction as any)._execute({ userId: gmId }, {
    action: { creatureId: goblinId, task: { prop: { _id: propId }, targetIds }, results: [], taskCount: 0 },
  });

  it('refuses two targets for a single-target action, on the server', async function () {
    let error: any;
    try {
      await insert(scimitarId, [lyraId, ariaId]);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'too-many-targets');
    assert.equal(error?.details?.i18n?.key, 'targetPicker.errors.singleTarget');
    assert.equal(await EngineActions.find({ creatureId: goblinId }).countAsync(), 0, 'nothing stored');
  });

  it('takes one target, and several for an action with multiple targets', async function () {
    assert.isString(await insert(scimitarId, [lyraId]));
    assert.isString(await insert(breathId, [lyraId, ariaId]));
  });
});

/*
 * What a player receives over DDP while the game master's goblin attacks
 * their character: their character's sheet, its log and the party board are
 * open. Not one of the goblin's numbers may arrive, in any document.
 */
if (Meteor.isServer) describe('A monster acting on a player\'s character: what the player receives', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  it('sends the player their character\'s entry, and nothing of the monster\'s numbers', async function () {
    const player = await openAs(playerId);
    const gm = await openAs(gmId);
    try {
      await player.subscribe('singleCharacter', lyraId);
      await player.subscribe('partyBoard', folderId);
      await player.subscribe('characterParties', lyraId);
      await gm.subscribe('singleCharacter', goblinId);
      // The game master attacks, as the sheet does: insertAction, then runAction
      const actionId = await gm.call('actions.insertAction', {
        action: { creatureId: goblinId, task: { prop: { _id: scimitarId }, targetIds: [lyraId] }, results: [], taskCount: 0 },
      });
      await gm.call('actions.runAction', { actionId, decisions: [] });
      const received = () => player.messages.find(message => message.collection === 'creatureLogs'
        && message.fields?.received?.fromCreatureId === goblinId);
      for (let i = 0; i < 50 && !received(); i += 1) await new Promise(resolve => setTimeout(resolve, 100));
      assert.exists(received(), 'the character\'s entry reached the player');
      assert.include(text(received()), 'Goblin 1 → you');
      const raw = text(player.messages);
      for (const canary of CANARIES) assert.notInclude(raw, canary, `the player received "${canary}"`);
      // Not the action in progress either, nor the monster's log
      assert.isEmpty(about(player.messages, 'actions', actionId));
      // The game master receives them all: the canaries are there to find
      const gmRaw = text(gm.messages);
      for (const canary of ['6543', '1d4 + 9876', 'SECRET-SUMMARY', 'Uses left']) assert.include(gmRaw, canary);
    } finally {
      player.close();
      gm.close();
    }
  });

  it('publishes a character\'s parties to its editors, fighting or not', async function () {
    const player = await openAs(playerId);
    // A player of the party, who may not edit the character
    const stranger = await openAs(otherPlayerId);
    try {
      await player.subscribe('characterParties', lyraId);
      await stranger.subscribe('characterParties', lyraId);
      const folder = about(player.messages, 'creatureFolders', folderId)[0];
      assert.exists(folder, 'the party, out of a fight');
      assert.sameMembers(Object.keys(folder.fields), ['name', 'owner', 'members', 'creatures']);
      assert.isEmpty(about(stranger.messages, 'creatureFolders', folderId), 'not to someone who may not edit it');
    } finally {
      player.close();
      stranger.close();
    }
  });
});

/*
 * The party's Discord channel gets each entry once: the game master's
 * monster's never (its log is the game master's), the character's entry
 * instead; when a party character acts on another, the actor's entry, and
 * the other's goes to its own channel only.
 */
if (Meteor.isServer) describe('A monster acting on a player\'s character: the party\'s Discord channel', function () {
  this.timeout(30000);
  const PARTY = { id: '1100000000000000011', token: 'party-token' };
  const OWN = { id: '1100000000000000012', token: 'own-token' };
  const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  let seen = 0;

  before(async function () {
    await setUp();
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await (setPartyWebhook as any)._execute({ userId: gmId }, { folderId, webhook: url(PARTY) });
    await Creatures.updateAsync(lyraId, { $set: { 'settings.discordWebhook': url(OWN) } });
  });

  after(async function () {
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previous);
    await fake.close();
    await tearDown();
  });

  // The messages posted since the last call, by webhook
  async function posted() {
    await discordIntakeIdle();
    await sender.idle();
    const fresh = fake.requests.slice(seen).filter(request => request.method !== 'GET');
    seen = fake.requests.length;
    return {
      party: fresh.filter(request => request.webhookId === PARTY.id).map(request => request.body),
      own: fresh.filter(request => request.webhookId === OWN.id).map(request => request.body),
    };
  }

  it('posts the character\'s entry once, under the character, naming it, without the monster\'s numbers', async function () {
    await posted();
    await act(scimitarId, [lyraId]);
    const { party, own } = await posted();
    assert.lengthOf(party, 1, 'one message in the party\'s channel: the character\'s entry, not the monster\'s');
    assert.equal(party[0].username, 'Lyra');
    assert.include(text(party[0]), 'Goblin 1 → Lyra', 'the channel\'s readers are the whole table');
    assert.lengthOf(own, 1, 'and the character\'s own channel');
    for (const canary of CANARIES) assert.notInclude(text([party, own]), canary);
  });

  it('posts a party character\'s action on another once there: the actor\'s entry', async function () {
    await posted();
    await act(cureId, [lyraId]);
    const { party, own } = await posted();
    assert.lengthOf(party, 1, 'once in the party\'s channel');
    assert.equal(party[0].username, 'Aria', 'the actor\'s entry');
    assert.lengthOf(own, 1, 'the character\'s entry in its own channel');
    assert.include(text(own[0]), 'Aria → Lyra');
  });
});
