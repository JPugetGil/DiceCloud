import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

//set up the collection for creature variables
const CreatureVariables = new Mongo.Collection('creatureVariables');

// Unique index on _creatureId
if (Meteor.isServer) {
  CreatureVariables.createIndexAsync({ _creatureId: 1 }, { unique: true })
    .catch(error => console.error('The index of creatureVariables was not created', error));
}

/** No schema because the structure isn't known until compute time
 * Expect documents to look like:
 * {
 *   _id: "nE8Ngd6K4L4jSxLY2",
 *   _creatureId: "nE8Ngd6K4L4jSxLY2", // indexed reference to the creature
 *   explicitlyDefinedVariableName: {...some creatureProperty},
 *   // Must be found in CreatureProperties before using:
 *   linkedProperty: { _propId: "nE8Ngd6K1234SxLY2" } 
 *   implicitVariableName: {value: 10},
 *   undefinedVariableName: {},
 * }
 * Where top level fields that don't start with `_` are variables on the sheet
**/

// The readers of a scope (getFromScope...) are in scopeVariables.ts

export default CreatureVariables;
