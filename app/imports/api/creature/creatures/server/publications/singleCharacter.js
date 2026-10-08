import SimpleSchema from 'meteor/aldeed:simple-schema';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { assertViewPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { WITHOUT_WEBHOOK } from '/imports/api/creature/creatures/webhookVisibility';
import computeCreature from '/imports/api/engine/computeCreature';
import VERSION from '/imports/constants/VERSION';
import { loadCreature } from '/imports/api/engine/loadCreatures';
import { rebuildCreatureNestedSets } from '/imports/api/parenting/parentingFunctions';
import EngineActions, { WITHOUT_SEED } from '/imports/api/engine/action/EngineActions';
import { Meteor } from 'meteor/meteor';
import { AsyncTracker } from 'meteor/nachocodoner:reactive-publish';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import Libraries from '/imports/api/library/Libraries';
import reactivePublication, { findOneReactive } from '/imports/api/utility/server/reactivePublication';

let schema = new SimpleSchema({
  creatureId: {
    type: String,
    max: 32,
  },
});

Meteor.publish('singleCharacter', function (creatureId) {
  const self = this;
  try {
    schema.validate({ creatureId });
  } catch (e) {
    this.error(e);
  }
  reactivePublication(this, async function ({ firstRun }) {
    let userId = this.userId;
    let permissionCreature = await findOneReactive(Creatures, {
      _id: creatureId,
    }, {
      fields: {
        owner: 1,
        readers: 1,
        writers: 1,
        public: 1,
        computeVersion: 1,
        templateId: 1,
      }
    });
    try { await assertViewPermission(permissionCreature, userId) }
    catch { return [] }
    // The Discord webhook only for those who may edit the character: anyone
    // else who has it could post in the channel, or delete the webhook
    const user = userId && await findOneReactive(Meteor.users, userId, { fields: { roles: 1 } });
    const canEdit = hasEditPermission(permissionCreature, user);
    // Its cache observes its documents for good: outside the computation, or
    // their first change reruns the sheet
    await AsyncTracker.nonreactive(() => loadCreature(creatureId, self));
    if (permissionCreature?.computeVersion !== VERSION && firstRun) {
      // Not awaited, as before Meteor 3: the results reach the client through
      // the cursors below as they land. Blocking the first run on it made the
      // first open of a newly created character never become ready -- the
      // compute finished, but the subscription never did.
      rebuildCreatureNestedSets(creatureId)
        .then(() => computeCreature(creatureId))
        .catch(e => console.error(e));
    }
    // A party board's monster: the bestiary entry it was copied from, and the
    // licence of its library, which the sheet's footer shows
    const templateId = permissionCreature.templateId;
    const libraryId = templateId && (await AsyncTracker.nonreactive(
      () => LibraryNodes.findOneAsync(templateId, { fields: { root: 1 } }),
    ))?.root?.id;
    // Made outside the computation, as in partyBoard: a cursor made in it
    // reruns the publication whenever one of its documents changes, and a
    // rerun sends every document again: each change to a property sent a
    // sheet's 190 documents again, 160 KB (2026-10-08). What decides what to
    // publish is read above
    return AsyncTracker.nonreactive(() => [
      ...libraryId ? [
        LibraryNodes.find({ _id: templateId }, { fields: { type: 1, name: 1, libraryTags: 1, root: 1 } }),
        Libraries.find({ _id: libraryId }, { fields: { name: 1, license: 1 } }),
      ] : [],
      Creatures.find({
        _id: creatureId,
      }, canEdit ? {} : { fields: WITHOUT_WEBHOOK }),
      CreatureVariables.find({
        _creatureId: creatureId,
      }),
      CreatureProperties.find({
        'root.id': creatureId,
      }),
      CreatureLogs.find({
        creatureId,
      }, {
        limit: 20,
        sort: { date: -1 },
      }),
      // Never the dice's secret seed (EngineActions.ts)
      EngineActions.find({
        creatureId,
      }, { fields: WITHOUT_SEED }),
      // Also publish the owner's username
      Meteor.users.find(permissionCreature.owner, {
        fields: {
          username: 1,
        },
      }),
    ]);
  });
});
