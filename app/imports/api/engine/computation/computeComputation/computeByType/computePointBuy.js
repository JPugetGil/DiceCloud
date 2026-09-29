import { has } from 'lodash';
import { resolveCalculationNode } from '/imports/api/engine/computation/computeComputation/computeByType/computeCalculation';
import { EJSON } from 'meteor/ejson';
import toPrimitiveOrString from '/imports/parser/toPrimitiveOrString';

export default async function computePointBuy(computation, node) {
  const prop = node.data;
  const min = has(prop, 'min.value') ? prop.min.value : null;
  const max = has(prop, 'max.value') ? prop.max.value : null;
  prop.spent = 0;
  for (const row of prop.values || []) {
    row.spent = 0;
    // A row without a value costs nothing, but the other rows still count
    if (row.value === undefined) continue;
    const costFunction = EJSON.clone(prop.cost);
    if (costFunction) costFunction._parseLevel = 'reduce';

    // Check min and max
    if (min !== null && row.value < min) {
      row.value = min;
    }
    if (max !== null && row.value > max) {
      row.value = max;
    }
    // Evaluate the cost function
    if (!costFunction) continue;
    await resolveCalculationNode(costFunction, costFunction.parseNode, {
      ...computation.scope, value: row.value
    });
    // resolveCalculationNode leaves only the valueNode: without this the cost
    // was never finite, so nothing was spent and the counter stayed at 0
    costFunction.value = toPrimitiveOrString(costFunction.valueNode);
    // Write calculation errors
    costFunction.errors?.forEach(error => {
      if (error?.message) {
        row.errors = row.errors || [];
        error.message = 'Cost calculation error.\n' + error.message;
        row.errors.push(error);
      }
    });
    if (Number.isFinite(costFunction.value)) {
      row.spent = costFunction.value;
      prop.spent += costFunction.value;
    }
  }
  prop.pointsLeft = (prop.total?.value || 0) - (prop.spent || 0);
  if (prop.spent > prop.total?.value) {
    prop.errors = prop.errors || [];
    prop.errors.push({
      type: 'pointBuyError',
      message: 'Spent more than total points available',
    });
  }
}
