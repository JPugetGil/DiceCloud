import { assert } from 'chai';
import { Random } from 'meteor/random';
import CreatureLogs, { trimCreatureLogs, PER_CREATURE_LOG_LIMIT } from '/imports/api/creature/log/CreatureLogs';

describe('Creature log trimming', function () {
  const creatureId = 'logTrimTestCreature';
  const otherCreatureId = 'logTrimTestOther';
  const base = Date.UTC(2026, 0, 1);

  // Raw inserts: the schema is not what is tested, and it keeps 100+ inserts quick
  function addLogs(id, count, dateOf = i => new Date(base + i * 1000)) {
    return CreatureLogs.rawCollection().insertMany(Array.from({ length: count }, (_, i) => ({
      _id: Random.id(),
      creatureId: id,
      date: dateOf(i),
      content: [{ value: `log ${i}` }],
    })));
  }
  const countLogs = id => CreatureLogs.find({ creatureId: id }).countAsync();

  beforeEach(async function () {
    await CreatureLogs.removeAsync({ creatureId: { $in: [creatureId, otherCreatureId] } });
  });

  it('keeps the newest logs up to the limit', async function () {
    await addLogs(creatureId, PER_CREATURE_LOG_LIMIT + 5);
    await trimCreatureLogs(creatureId);
    assert.equal(await countLogs(creatureId), PER_CREATURE_LOG_LIMIT);
    const oldest = await CreatureLogs.findOneAsync({ creatureId }, { sort: { date: 1 } });
    assert.equal(oldest.content[0].value, 'log 5', 'the five oldest logs are the ones removed');
  });

  it('removes nothing at or under the limit', async function () {
    await addLogs(creatureId, PER_CREATURE_LOG_LIMIT);
    await trimCreatureLogs(creatureId);
    assert.equal(await countLogs(creatureId), PER_CREATURE_LOG_LIMIT);
  });

  it('only trims the given creature', async function () {
    await addLogs(creatureId, PER_CREATURE_LOG_LIMIT + 5);
    await addLogs(otherCreatureId, PER_CREATURE_LOG_LIMIT + 5);
    await trimCreatureLogs(creatureId);
    assert.equal(await countLogs(otherCreatureId), PER_CREATURE_LOG_LIMIT + 5);
  });

  it('keeps logs that share the oldest kept date', async function () {
    // All logs at the same instant: none is older than the oldest one kept
    await addLogs(creatureId, PER_CREATURE_LOG_LIMIT + 5, () => new Date(base));
    await trimCreatureLogs(creatureId);
    assert.equal(await countLogs(creatureId), PER_CREATURE_LOG_LIMIT + 5);
  });
});
