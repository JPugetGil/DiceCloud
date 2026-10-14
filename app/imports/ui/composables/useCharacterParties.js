import { toValue } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { partiesOf } from '/imports/ui/creature/actions/targets/targetCandidates';

/**
 * The parties a character plays in, for its sheet (characterParties), and
 * the board of each one fighting (partyBoard): the target picker opens by
 * itself during a fight, with the creatures it may target, whose variables
 * and health bars the action's simulation reads (phase 2.1 of the monsters)
 * @param {import('vue').MaybeRefOrGetter<string>} creatureId
 */
export default function useCharacterParties(creatureId) {
  autorun(() => {
    const id = toValue(creatureId);
    if (!id) return;
    Meteor.subscribe('characterParties', id);
    // Made in this computation: Meteor stops each one its rerun no longer makes
    partiesOf(id, { fighting: true }).forEach(party => Meteor.subscribe('partyBoard', party._id));
  });
}
