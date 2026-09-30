import { ValidatedMethod } from 'meteor/mdg:validated-method';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { moveDocWithinRoot } from '/imports/api/parenting/parentingFunctions';
import getRootCreatureAncestor from '/imports/api/creature/creatureProperties/getRootCreatureAncestor';
import BUILT_IN_TAGS from '/imports/constants/BUILT_IN_TAGS';
import getParentByTag from './getParentByTag';
import { Meteor } from 'meteor/meteor';

// Equipping or unequipping an item will also change its parent
const equipItem = new ValidatedMethod({
  name: 'creatureProperties.equip',
  validate({ _id, equipped }) {
    if (!_id) throw new Meteor.Error('No _id', '_id is required');
    if (equipped !== true && equipped !== false) {
      throw new Meteor.Error('No equipped', 'equipped is required to be true or false');
    }
  },
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, equipped }) {
    let item = await CreatureProperties.findOneAsync(_id);
    if (!item) throw new Meteor.Error('not-found', 'Item not found');
    if (item.type !== 'item') throw new Meteor.Error('wrong type',
      'Equip and unequip can only be performed on items');
    let creature = await getRootCreatureAncestor(item);
    await assertEditPermission(creature, this.userId);
    await CreatureProperties.updateAsync(_id, {
      $set: { equipped, dirty: true },
    }, {
      selector: { type: 'item' },
    });
    // Move the item to the end of the first folder tagged for equipment or
    // carried items, or to the end of the creature's tree when there is none
    const tag = equipped ? BUILT_IN_TAGS.equipment : BUILT_IN_TAGS.carried;
    const parent = await getParentByTag(creature._id, tag);
    let newPosition;
    if (parent) {
      newPosition = parent.right - 0.5;
    } else {
      const last = await CreatureProperties.findOneAsync({
        'root.id': creature._id,
        removed: { $ne: true },
      }, {
        sort: { right: -1 },
        fields: { right: 1 },
      });
      newPosition = (last?.right || 0) + 0.5;
    }
    // The tagged folder may be the item itself or one of its children
    if (newPosition > item.left && newPosition < item.right) return;
    await moveDocWithinRoot(item, CreatureProperties, newPosition);

    // Recompute: weights of containers depend on where the item now sits
    await Creatures.updateAsync(creature._id, { $set: { dirty: true } });
  },
});

export default equipItem;
