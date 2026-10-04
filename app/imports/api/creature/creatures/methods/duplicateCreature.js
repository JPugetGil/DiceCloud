import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { omit } from 'lodash';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import { getArchiveObj } from '/imports/api/creature/archive/methods/archiveCreatureToFile';
import { renewDocIds } from '/imports/api/parenting/parentingFunctions';
import { assertCopyPermission } from '/imports/api/sharing/sharingPermissions';
import { assertCanCreateCharacter } from '/imports/api/users/assertRolePermissions';
import batchInsertAsync from '/imports/api/utility/batchInsertAsync';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

let computeCreature;
if (Meteor.isServer) {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  computeCreature = require('/imports/api/engine/computeCreature').default;
}

/**
 * Insert a character archive ({ creature, properties, experiences, logs }) as
 * a new character owned by `owner`: every document gets a new id, and the
 * references between them follow. The copy is shared with nobody and keeps no
 * Discord webhook, which would post its rolls to the original's channel.
 * Returns the new character's id.
 */
export async function insertCreatureCopy(archive, { owner, name = undefined }) {
  const oldId = archive.creature._id;
  const creatureId = Random.id();
  const idMap = { [oldId]: creatureId };

  const properties = (archive.properties || []).filter(prop => !prop.removed);
  renewDocIds({ docArray: properties, idMap });
  // A buff the character applied to itself names the character or one of its
  // properties: those have new ids too
  for (const prop of properties) {
    if (prop.appliedBy?.id && prop.appliedBy.id in idMap) {
      prop.appliedBy.id = idMap[prop.appliedBy.id];
    }
  }
  const withNewIds = docs => (docs || []).map(doc => ({ ...doc, _id: Random.id(), creatureId }));

  const creature = {
    ...omit(archive.creature, ['computeVersion', 'lastComputedAt']),
    _id: creatureId,
    owner,
    readers: [],
    writers: [],
    public: false,
    readersCanCopy: false,
    name: name ?? archive.creature.name,
    settings: omit(archive.creature.settings, 'discordWebhook'),
    dirty: true,
  };

  await Creatures.insertAsync(creature);
  try {
    if (properties.length) await batchInsertAsync(CreatureProperties, properties);
    const experiences = withNewIds(archive.experiences);
    if (experiences.length) await batchInsertAsync(Experiences, experiences);
    const logs = withNewIds(archive.logs);
    if (logs.length) await batchInsertAsync(CreatureLogs, logs);
  } catch (e) {
    await removeCreatureWork(creatureId);
    throw e;
  }
  // The engine's links between properties (effects, triggers...) hold the
  // original's ids until the copy is computed
  try {
    await computeCreature(creatureId);
  } catch (e) {
    // It is computed again when its sheet opens
    console.error(e);
  }
  return creatureId;
}

/**
 * Copy a character, with its properties and experiences but not its log, into
 * a new character of the user's. Needs the right to copy it (owner, editor,
 * or reader of a character whose readers may copy it), and counts towards the
 * user's character limit.
 */
const duplicateCreature = new ValidatedMethod({
  name: 'creatures.duplicate',
  validate: new SimpleSchema({
    creatureId: {
      type: String,
      max: 32,
    },
    // The copy's name, the original's by default
    name: {
      type: String,
      optional: true,
      max: STORAGE_LIMITS.name,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 2,
    timeInterval: 5000,
  },
  async run({ creatureId, name }) {
    if (Meteor.isClient) return;
    const creature = await Creatures.findOneAsync(creatureId, {
      fields: { owner: 1, readers: 1, writers: 1, public: 1, readersCanCopy: 1 },
    });
    await assertCopyPermission(creature, this.userId);
    await assertCanCreateCharacter(this.userId);
    const archive = await getArchiveObj(creatureId);
    return insertCreatureCopy({ ...archive, logs: [] }, { owner: this.userId, name });
  },
});

export default duplicateCreature;
