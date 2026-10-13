import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureLogs, { PER_CREATURE_LOG_LIMIT } from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { openAs, refusal } from '/imports/api/utility/ddpClient.testFn';
import '/imports/api/creature/creatures/methods/importCharacterFromDiceCloudInstance';

/*
 * A character imported from another DiceCloud instance, as its REST API
 * gives it: database version 2 (ancestors, parent, order) or 3, migrated and
 * cleaned, then inserted for the user who imports it. The file is the
 * client's: anything in it may be forged.
 */
if (Meteor.isServer) describe('Importing a character from another instance', function () {
  this.timeout(60000);

  const [userId, playerId] = [Random.id(), Random.id()];
  const importedIds: string[] = [];

  /** A creature as the API of a version 2 instance gives it */
  function apiCreature({ logs = 1 } = {}) {
    const creatureId = Random.id();
    importedIds.push(creatureId);
    const [gearId, ropeId, backstoryId] = [Random.id(), Random.id(), Random.id()];
    const creatureRef = { collection: 'creatures', id: creatureId };
    return {
      creatureId, gearId, ropeId, backstoryId,
      data: {
        meta: { schemaVersion: 2 },
        creatures: [{
          _id: creatureId,
          name: 'Imported Hero',
          // The other instance's users and settings
          owner: 'someoneElsewhere',
          readers: [Random.id()],
          writers: [Random.id()],
          type: 'monster',
          settings: { discordWebhook: 'https://discord.com/api/webhooks/1/token' },
          discordSession: { webhookId: '1', threadId: '2', name: 'Session' },
        }],
        creatureProperties: [
          {
            _id: gearId, type: 'folder', name: 'Gear', order: 1,
            ancestors: [creatureRef], parent: creatureRef,
          },
          {
            _id: ropeId, type: 'item', name: 'Rope', quantity: 1, order: 2, notAField: 'dropped',
            ancestors: [creatureRef, { collection: 'creatureProperties', id: gearId }],
            parent: { collection: 'creatureProperties', id: gearId },
          },
          {
            _id: backstoryId, type: 'note', name: 'Backstory', order: 3,
            ancestors: [creatureRef], parent: creatureRef,
          },
        ],
        experiences: [{ _id: Random.id(), creatureId, name: 'Goblin ambush', xp: 50, date: new Date() }],
        logs: Array.from({ length: logs }, (_, i) => ({
          _id: Random.id(), creatureId, content: [{ name: 'Roll', value: `1d20 [${i % 20 + 1}]` }], date: new Date(),
        })),
      },
    };
  }

  before(async function () {
    await Meteor.users.rawCollection().insertMany([
      // An admin owns any number of characters
      { _id: userId, createdAt: new Date(), username: `import-user-${userId}`, roles: ['admin'] },
      { _id: playerId, createdAt: new Date(), username: `import-player-${playerId}` },
    ] as any[]);
  });

  after(async function () {
    await CreatureProperties.removeAsync({ 'root.id': { $in: importedIds } });
    await CreatureVariables.removeAsync({ _creatureId: { $in: importedIds } });
    await CreatureLogs.removeAsync({ creatureId: { $in: importedIds } });
    await Experiences.removeAsync({ creatureId: { $in: importedIds } });
    await Creatures.removeAsync({ _id: { $in: importedIds } });
    await Meteor.users.removeAsync({ _id: { $in: [userId, playerId] } });
  });

  const importAs = async (asUserId: string, characterData: unknown) => {
    const client = await openAs(asUserId);
    try {
      return await client.call('Creatures.methods.importFromInstance', { characterData });
    } finally {
      client.close();
    }
  };

  it('imports a version 2 character as the user\'s own player character, without the other instance\'s users nor Discord', async function () {
    const { creatureId, data } = apiCreature();
    assert.equal(await importAs(userId, data), creatureId);
    const creature = await Creatures.findOneAsync(creatureId) as any;
    assert.equal(creature.owner, userId);
    assert.equal(creature.type, 'pc', 'a player character, which the character limit counts');
    assert.deepEqual(creature.readers, []);
    assert.deepEqual(creature.writers, []);
    assert.notProperty(creature.settings || {}, 'discordWebhook');
    assert.notProperty(creature, 'discordSession');
  });

  it('migrates the properties to version 3, cleaned, in a tree whose nested sets hold', async function () {
    const { creatureId, gearId, ropeId, backstoryId, data } = apiCreature();
    await importAs(userId, data);
    const props = await CreatureProperties.find({ 'root.id': creatureId }).fetchAsync() as any[];
    const byId = (id: string) => props.find(prop => prop._id === id);
    assert.lengthOf(props, 3);
    for (const prop of props) assert.deepEqual(prop.root, { collection: 'creatures', id: creatureId });
    assert.equal(byId(ropeId).parentId, gearId);
    assert.notProperty(byId(gearId), 'parentId', 'at the top of the tree');
    assert.notProperty(byId(ropeId), 'notAField', 'cleaned by its schema');
    assert.notProperty(byId(ropeId), 'ancestors');
    // The rope under the gear folder, the backstory after it
    const [gear, rope, backstory] = [byId(gearId), byId(ropeId), byId(backstoryId)];
    assert.isTrue(gear.left < rope.left && rope.right < gear.right, 'the rope is in the gear folder');
    assert.isTrue(gear.right < backstory.left, 'the backstory comes after');
    assert.isTrue(props.every(prop => prop.left < prop.right), 'every property spans its descendants');
  });

  it('keeps its experiences, and at most as many log entries as a character keeps', async function () {
    const { creatureId, data } = apiCreature({ logs: PER_CREATURE_LOG_LIMIT + 5 });
    await importAs(userId, data);
    assert.equal(await Experiences.find({ creatureId }).countAsync(), 1);
    assert.equal(await CreatureLogs.find({ creatureId }).countAsync(), PER_CREATURE_LOG_LIMIT);
  });

  it('refuses a file with anything of another creature, a creature twice, or two creatures', async function () {
    const other = Random.id();
    for (const [key, forge] of [
      ['creatureProperties', (prop: any) => ({ ...prop, ancestors: [{ collection: 'creatures', id: other }] })],
      ['logs', (log: any) => ({ ...log, creatureId: other })],
      ['experiences', (experience: any) => ({ ...experience, creatureId: other })],
    ] as const) {
      const { creatureId, data } = apiCreature();
      (data as any)[key] = (data as any)[key].map(forge);
      assert.exists(await refusal(importAs(userId, data)), `${key} of another creature`);
      assert.notExists(await Creatures.findOneAsync(creatureId), 'nothing imported');
    }
    const { data } = apiCreature();
    await importAs(userId, data);
    assert.equal((await refusal(importAs(userId, data)))?.error, 'Already exists');
    const two = apiCreature().data;
    two.creatures.push({ ...two.creatures[0], _id: Random.id() });
    assert.exists(await refusal(importAs(userId, two)), 'two creatures');
    assert.notExists(await Creatures.findOneAsync(two.creatures[0]._id));
  });

  it('restores a version 2 archive in a tree whose nested sets hold, as the import does', async function () {
    const { creatureId, gearId, ropeId, data } = apiCreature();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { restoreCreature } = require('/imports/api/creature/archive/methods/restoreCreatureFromFile');
    await restoreCreature({
      meta: { schemaVersion: 2 },
      creature: data.creatures[0],
      properties: data.creatureProperties,
      experiences: data.experiences,
      logs: data.logs,
    }, userId);
    const gear = await CreatureProperties.findOneAsync(gearId) as any;
    const rope = await CreatureProperties.findOneAsync(ropeId) as any;
    assert.equal(rope.root.id, creatureId);
    assert.isTrue(gear.left < rope.left && rope.right < gear.right, 'the rope is in the gear folder');
  });

  it('counts towards the character limit', async function () {
    // A player owns two characters at most
    await Creatures.rawCollection().insertMany([0, 1].map(() => {
      const _id = Random.id();
      importedIds.push(_id);
      return { _id, name: 'Mine', owner: playerId, type: 'pc', readers: [], writers: [] } as any;
    }));
    const { creatureId, data } = apiCreature();
    assert.equal((await refusal(importAs(playerId, data)))?.error, 'Character limit reached');
    assert.notExists(await Creatures.findOneAsync(creatureId));
  });
});
