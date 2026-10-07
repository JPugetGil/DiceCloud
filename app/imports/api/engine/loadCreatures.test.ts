import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [creatureId] = getRandomIds(1);

describe('Loaded creatures', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature({
      _id: creatureId,
      props: [{
        type: 'attribute',
        variableName: 'strength',
        attributeType: 'ability',
        baseValue: { calculation: '10' },
      }],
    });
  });

  // Deleting a character removes the creature, then its properties: each
  // removed property started a computation of a creature that no longer
  // existed, logged as "Build computation failed, the creature was not found"
  it('does not compute a creature deleted while it is loaded', async function () {
    const logged: string[] = [];
    const debug = Meteor._debug;
    Meteor._debug = (...args: any[]) => {
      logged.push(args.map(String).join(' '));
    };
    try {
      await Creatures.removeAsync(creatureId);
      await CreatureProperties.removeAsync({ 'root.id': creatureId });
      // Longer than the computation's debounce
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      Meteor._debug = debug;
    }
    assert.notInclude(logged.join('\n'), 'the creature was not found');
  });
});
