import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { DealDamageTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { applyDamageMultipliers, dealDamage } from '/imports/api/engine/action/applyProperties/applyDamageProperty';
import { getConstantValueFromScope, getFromScope } from '/imports/api/creature/creatures/CreatureVariables';
import { getVariables } from '/imports/api/engine/loadCreatures';
import { damageTypeMessage, logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';
import { Meteor } from 'meteor/meteor';

// The DC of the Constitution save that keeps a creature concentrating
export const concentrationDc = (damage: number) => Math.max(10, Math.floor(damage / 2));

/**
 * Damage or healing typed in by hand (the health bar's Damage and Healing
 * buttons), dealt the way a damage property deals it: through the creature's
 * health bars in their damage order, temporary hit points first, running
 * their damage triggers. A creature that concentrates (a `concentration`
 * toggle or constant that is on) is reminded of its saving throw.
 *
 * Its weaknesses, resistances and immunities go through
 * applyDamageMultipliers, which applies none of them (a known bug of the
 * engine, left for the product owner to decide).
 */
export default async function applyDealDamageTask(
  task: DealDamageTask, action: EngineAction, result: TaskResult, inputProvider: InputProvider
): Promise<void> {
  if (task.targetIds.length !== 1) {
    throw new Meteor.Error('wrong-number-of-targets', 'Damage is dealt to one creature at a time');
  }
  const targetId = task.targetIds[0];
  const { damageType } = task.params;
  const healing = damageType === 'healing';
  let amount = Math.floor(Number(task.params.amount));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const logValue: LogPart[] = [];
  if (damageType && !healing) {
    amount = applyDamageMultipliers({
      target: targetId, damage: amount, damageProp: { damageType, tags: [] }, logValue,
    });
  }
  let amountMessage;
  if (healing) amountMessage = msg('logs.healingAmount', { amount });
  else if (damageType) amountMessage = msg('logs.damageAmount', { amount, type: damageTypeMessage(damageType) });
  else amountMessage = msg('logs.untypedDamageAmount', { amount });
  result.appendLog(logLine({
    name: msg(healing ? 'logs.healing' : 'logs.damage'),
    value: [amountMessage, ...logValue],
    inline: true,
    silenced: task.silent,
  }), [targetId]);

  // dealDamage only reads `healing` from the type
  await dealDamage(action, { damageType }, result, inputProvider, targetId, damageType || '', amount);

  if (!healing && amount > 0) {
    if (await isConcentrating(targetId)) {
      // After the health bars' lines
      const reminder = new TaskResult(task.targetIds);
      action.results.push(reminder);
      reminder.appendLog(logLine({
        name: msg('logs.concentration'),
        value: msg('logs.concentrationCheck', { dc: concentrationDc(amount) }),
        inline: true,
        silenced: task.silent,
      }), [targetId]);
    }
  }
}

/**
 * Whether the creature concentrates: its `concentration` variable, a toggle
 * that is on (the libraries' "Concentration" checkbox) or a true constant
 */
async function isConcentrating(creatureId: string) {
  const scope = await getVariables(creatureId);
  const variable = await getFromScope('concentration', scope);
  if (variable?.type === 'toggle') {
    return !variable.inactive && !!(variable.enabled || (!variable.disabled && variable.condition?.value));
  }
  return !!await getConstantValueFromScope('concentration', scope);
}
