import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import { prettifyParseError, parse } from '/imports/parser/parser';

/**
 * Evaluates the slotFillerCondition of each node against a creature's variables.
 *
 * Resolves to a Map of node id -> the message to show for every node whose
 * condition is not met. `resolve` is async since the Meteor 3 migration, so the
 * dialogs can no longer flag nodes while they build their list: flags set after
 * the list was returned never reached the page, and fillers whose requirements
 * failed were offered as if they were met.
 */
export default async function evaluateSlotFillerConditions(nodes, variables) {
  const errors = new Map();
  await Promise.all((nodes || []).map(async node => {
    if (!node.slotFillerCondition) return;
    try {
      const parseNode = parse(node.slotFillerCondition);
      const { result: resultNode } = await resolve('reduce', parseNode, variables);
      if (resultNode?.parseType === 'constant') {
        if (!resultNode.value) {
          errors.set(node._id, node.slotFillerConditionNote || node.slotFillerCondition);
        }
      } else {
        errors.set(node._id, node.slotFillerConditionNote || toString(resultNode));
      }
    } catch (e) {
      console.warn(e);
      errors.set(node._id, 'Condition error: ' + prettifyParseError(e));
    }
  }));
  return errors;
}
