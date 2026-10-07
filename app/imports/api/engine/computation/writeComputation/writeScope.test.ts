import { assert } from 'chai';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import writeScope from '/imports/api/engine/computation/writeComputation/writeScope';
import { Random } from 'meteor/random';

// A computation of a creature that has no variables document yet
const firstComputation = (strength: number) => ({
  scope: { strength: { value: strength } },
  variables: undefined,
}) as any;

describe('Write a computation\'s scope', function () {
  // A creature added several at once (party board monsters) can be computed
  // twice at the same moment before its variables exist: both computations
  // find no variables document, and both insert one
  it('survives two first computations of a creature at once', async function () {
    const creatureId = Random.id();
    await Promise.all([
      writeScope(creatureId, firstComputation(8)),
      writeScope(creatureId, firstComputation(8)),
    ]);
    const variables = await CreatureVariables.find({ _creatureId: creatureId }).fetchAsync();
    assert.lengthOf(variables, 1, 'one variables document');
    assert.equal(variables[0].strength?.value, 8, 'the variables were written');
  });
});
