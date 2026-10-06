import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import { buffDurationRounds } from '/imports/api/creature/creatureFolders/buffDurations';
import computeCreature from '/imports/api/engine/computeCreature';
import { loadedCreatures } from '/imports/api/engine/loadCreatures';
import { softRemove } from '/imports/api/parenting/softRemove';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { Meteor } from 'meteor/meteor';
import { logLine, msg } from '/imports/api/creature/log/logMessages';

/**
 * A creature's turn starts in a party's initiative tracker: each of its active
 * effects that lasts some rounds has one less, and those whose last round is
 * spent end, logged on the creature. Only for a creature the game master who
 * runs the tracker may edit.
 */
export async function startCreatureTurn(creatureId, userId) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: { name: 1, owner: 1, writers: 1 },
  });
  const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  if (!creature || !hasEditPermission(creature, user)) return [];

  const buffs = await CreatureProperties.find({
    'root.id': creatureId,
    type: 'buff',
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 },
    fields: { name: 1, duration: 1, durationSpent: 1, left: 1, right: 1, root: 1, parentId: 1 },
  }).fetchAsync();

  const ended = [];
  for (const buff of buffs) {
    // Inside an effect that just ended: gone with it
    if (ended.some(parent => parent.left < buff.left && parent.right > buff.right)) continue;
    const rounds = buffDurationRounds(buff);
    if (!rounds) continue;
    const spent = (buff.durationSpent || 0) + 1;
    if (spent >= rounds) {
      await softRemove(CreatureProperties, buff);
      ended.push(buff);
    } else {
      // The buff's schema: the generic one has no durationSpent, and would drop it
      await CreatureProperties.updateAsync(buff._id, { $set: { durationSpent: spent } }, {
        selector: { type: 'buff' },
      });
    }
  }
  if (!ended.length) return [];

  await insertCreatureLogWork({
    log: {
      creatureId,
      creatureName: creature.name,
      content: ended.map(buff => logLine({ name: buff.name || msg('logs.effect'), value: msg('logs.effectEnded') })),
    },
  });
  // A sheet or board showing the creature recomputes it on its own
  if (!loadedCreatures.has(creatureId)) await computeCreature(creatureId);
  return ended.map(buff => buff._id);
}
