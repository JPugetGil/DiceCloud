import computationFromProps from '/imports/api/engine/computation/utility/computationFromProps.testFn';
import { assert } from 'chai';
import clean from '../../utility/cleanProp.testFn';

export default function () {
  const computation = computationFromProps(testProperties);
  const getLink = computation.dependencyGraph.hasLink;
  const getNode = computation.dependencyGraph.getNode;

  assert.equal(
    getLink('strength', 'strengthId').data, 'definition',
    'Links variable names to props that define them'
  );
  assert.exists(
    getNode('strength'),
    'Creates variable name nodes when attributes define them'
  );
}

var testProperties = [
  clean({
    _id: 'strengthId',
    type: 'attribute',
    variableName: 'strength',
  }),
];
