import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { conditionKey, conditionTags } from '/imports/api/creature/creatureProperties/conditions';

/**
 * The conditions the character's libraries hold, for its editors to give in
 * one click: one of each, from the first library that has it, by name
 */
const listConditions = new ValidatedMethod({
  name: 'creatureProperties.listConditions',
  validate: new SimpleSchema({
    creatureId: { type: String, max: 32 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ creatureId }) {
    // The client has neither the libraries nor their nodes
    if (Meteor.isClient) return;
    const creature = await Creatures.findOneAsync(creatureId, {
      fields: { owner: 1, readers: 1, writers: 1, public: 1, allowedLibraries: 1, allowedLibraryCollections: 1 },
    });
    await assertEditPermission(creature, this.userId);
    const libraryIds = await getCreatureLibraryIds(creature, this.userId);
    if (!libraryIds.length) return [];
    const nodes = await LibraryNodes.find({
      'root.id': { $in: libraryIds },
      type: 'buff',
      libraryTags: 'condition',
      removed: { $ne: true },
    }, {
      fields: { name: 1, libraryTags: 1, 'root.id': 1, 'description.text': 1 },
      sort: { left: 1 },
      limit: 500,
    }).fetchAsync();
    const libraryOrder = id => libraryIds.indexOf(id);
    nodes.sort((a, b) => libraryOrder(a.root.id) - libraryOrder(b.root.id));
    const conditions = new Map();
    for (const node of nodes) {
      if (!node.name) continue;
      const condition = {
        _id: node._id,
        name: node.name,
        tags: conditionTags(node.libraryTags),
        description: node.description?.text,
      };
      const key = conditionKey(condition);
      if (!conditions.has(key)) conditions.set(key, condition);
    }
    return [...conditions.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export default listConditions;
