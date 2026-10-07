import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { EJSON } from 'meteor/ejson';

// MongoDB's error code for a write that breaks a unique index
const DUPLICATE_KEY = 11000;

export default async function writeScope(creatureId, computation) {
  if (!creatureId) throw 'creatureId is required';
  const scope = computation.scope;
  let variables = computation.variables;
  // If the variables are not set, check if they can be fetched
  if (!variables) {
    variables = await CreatureVariables.findOneAsync({
      _creatureId: creatureId
    });
  }
  // Otherwise create a new variables document. Two computations of a new
  // creature can both find none: the second insert then fails on the unique
  // index on _creatureId, and writes to the document the first one made
  if (!variables) {
    try {
      await CreatureVariables.insertAsync({
        _creatureId: creatureId
      });
    } catch (e) {
      if (/** @type {{ code?: number }} */ (e)?.code !== DUPLICATE_KEY) throw e;
    }
    variables = {};
  }
  delete variables._id;
  delete variables._creatureId;

  let $set, $unset;

  for (const key in scope) {
    // Mongo can't handle keys that start with a dollar sign
    if (key[0] === '$' || key[0] === '_') continue;

    // Remove empty objects
    if (Object.keys(scope[key]).length === 0) {
      delete scope[key];
      continue;
    }

    // Remove large properties that aren't likely to be accessed
    delete scope[key].parent;

    // Remove empty keys
    for (const subKey in scope[key]) {
      if (scope[key][subKey] === undefined) {
        delete scope[key][subKey]
      }
    }

    // If this is a creature property, replace the property with a link
    if (scope[key]._id && scope[key].type) {
      scope[key] = { _propId: scope[key]._id };
    }

    // Only update changed fields
    if (!EJSON.equals(variables[key], scope[key])) {
      if (!$set) $set = {};
      // Set the changed key in the creature variables
      $set[key] = scope[key];
    }
  }

  // Remove all the keys that no longer exist in scope
  for (const key in variables) {
    if (!scope[key]) {
      if (!$unset) $unset = {};
      $unset[key] = 1;
    }
  }

  if ($set || $unset) {
    const update = {};
    if ($set) update.$set = $set;
    if ($unset) update.$unset = $unset;
    await CreatureVariables.updateAsync({ _creatureId: creatureId }, update);
  }
  if (computation.creature?.dirty) {
    await Creatures.updateAsync({ _id: creatureId }, { $unset: { dirty: 1 } });
  }
}
