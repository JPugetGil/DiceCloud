import { buildComputationFromProps } from '/imports/api/engine/computation/buildCreatureComputation';
import { assert } from 'chai';
import clean from '../../utility/cleanProp.testFn';
import { applyNestedSetProperties } from '/imports/api/parenting/parentingFunctions';

export default function () {
  const computation = buildComputationFromProps(testProperties);
  const hasLink = computation.dependencyGraph.hasLink;
  const prop = (id) => computation.propsById[id];
  assert.isTrue(
    !!hasLink('childId.description.inlineCalculations[0]', 'spellListId.dc'),
    'Ancestor references of parent in inline calculations should create dependency'
  );
  assert.isTrue(
    !!hasLink('grandchildId.dc', 'spellListId.dc'),
    'References to higher ancestor should create dependency'
  );
  assert.isTrue(
    !!hasLink('dcChildId.dc', 'dcSpellListId.dc'),
    'References to an ancestor\'s calculation depend on that calculation'
  );
  assert.isFalse(
    !!hasLink('dcChildId.dc', 'dcSpellListId'),
    'References to an ancestor\'s calculation do not depend on the whole ancestor'
  );
  assert.isTrue(
    !!hasLink('nameChildId.description.inlineCalculations[0]', 'dcSpellListId'),
    'References to an ancestor\'s other fields depend on the whole ancestor'
  );
  assert.isTrue(
    !!hasLink('grandchildId.dc', 'strength'),
    'Variable references create dependencies'
  );
  assert.isTrue(
    !!hasLink('grandchildId.dc', 'wisdom'),
    'Variable references create dependencies even if the attributes don\'t exist'
  );
  assert.equal(
    prop('strengthId').baseValue.parseError.message, 'Unexpected end of input',
    'Parse errors should be stored on the calculation doc'
  );
}

var testProperties = [
  clean({
    _id: 'spellListId',
    type: 'spellList',
  }),
  clean({
    _id: 'childId',
    type: 'spell',
    description: {
      text: 'DC {#spellList.dc} save or suck'
    },
    parentId: 'spellListId',
  }),
  clean({
    _id: 'grandchildId',
    type: 'savingThrow',
    dc: {
      calculation: '#spellList.dc + strength + wisdom.modifier'
    },
    parentId: 'childId',
  }),
  clean({
    _id: 'dcSpellListId',
    type: 'spellList',
    dc: {
      calculation: '8 + 2',
    },
  }),
  clean({
    _id: 'dcChildId',
    type: 'savingThrow',
    dc: {
      calculation: '#spellList.dc',
    },
    parentId: 'dcSpellListId',
  }),
  clean({
    _id: 'nameChildId',
    type: 'spell',
    description: {
      text: 'From {#spellList.name}'
    },
    parentId: 'dcSpellListId',
  }),
  clean({
    _id: 'strengthId',
    type: 'attribute',
    variableName: 'strength',
    baseValue: {
      calculation: '15 + ',
    },
  }),
];

applyNestedSetProperties(testProperties);
