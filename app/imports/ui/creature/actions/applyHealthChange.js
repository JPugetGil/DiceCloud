import doAction from '/imports/ui/creature/actions/doAction';
import getPropertyTitle from '/imports/ui/properties/shared/getPropertyTitle';

/**
 * A health bar's menu applied (HealthChangeMenu): damage and healing go
 * through the engine as a damage property's would (temporary hit points
 * first, the creature's triggers, a concentration reminder); setting changes
 * only this bar. `elementId` is where the action's dialog grows from.
 */
export default function applyHealthChange({ model, mode, value, damageType, elementId }) {
  const creatureId = model.root.id;
  /** @type {any} a DamagePropTask or a DealDamageTask */
  const task = mode === 'set' ? {
    subtaskFn: 'damageProp',
    targetIds: [creatureId],
    params: {
      title: getPropertyTitle(model),
      operation: 'set',
      value,
      targetProp: model,
    },
  } : {
    subtaskFn: 'dealDamage',
    targetIds: [creatureId],
    params: { amount: value, damageType },
  };
  return doAction({ creatureId, elementId: elementId || model._id, task });
}
