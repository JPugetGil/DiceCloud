import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import getRootCreatureAncestor from '/imports/api/creature/creatureProperties/getRootCreatureAncestor';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { fetchDocByRef, rebuildNestedSets } from '/imports/api/parenting/parentingFunctions';
import { RefSchema } from '/imports/api/parenting/ChildSchema';

/** @typedef {import('/imports/api/creature/creatures/Creatures').Creature} Creature */
/** @typedef {import('/imports/api/creature/creatureProperties/CreatureProperties').CreatureProperty} CreatureProperty */

const insertProperty = new ValidatedMethod({
  name: 'creatureProperties.insert',
  validate: new SimpleSchema({
    creatureProperty: {
      type: Object,
      blackbox: true,
    },
    parentRef: RefSchema,
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ creatureProperty, parentRef }) {
    /** @type {Creature} */
    let rootCreature;
    /** @type {Creature | CreatureProperty} */
    const parentDoc = await fetchDocByRef(parentRef);

    // Check permission to edit
    if (parentRef.collection === 'creatures') {
      rootCreature = /** @type {Creature} */ (parentDoc);
    } else if (parentRef.collection === 'creatureProperties') {
      // Found: assertEditPermission throws otherwise
      rootCreature = /** @type {Creature} */ (await getRootCreatureAncestor(parentDoc));
      creatureProperty.parentId = parentDoc._id;
    } else {
      throw `${parentRef.collection} is not a valid parent collection`
    }
    await assertEditPermission(rootCreature, this.userId);

    creatureProperty.root = { collection: 'creatures', id: rootCreature._id };

    return await insertPropertyWork(creatureProperty);
  },
});

export async function insertPropertyWork(property) {
  delete property._id;
  property.dirty = true;
  let _id = await CreatureProperties.insertAsync(property);
  // Tree structure changed by insert, reorder the tree
  await rebuildNestedSets(CreatureProperties, property.root.id);
  return _id;
}

export default insertProperty;
