import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { DealDamageTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { applyDamageMultipliers, dealDamage } from '/imports/api/engine/action/applyProperties/applyDamageProperty';
import { damageTypeMessage, logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';
import { WHOLE } from '/imports/api/creature/log/logViews';
import { Meteor } from 'meteor/meteor';

// Where it was first: dealDamage now reminds any creature it damages
export { concentrationDc } from '/imports/api/engine/action/applyProperties/applyDamageProperty';

/**
 * Damage or healing typed in by hand (the health bar's Damage and Healing
 * buttons), dealt the way a damage property deals it: through the creature's
 * health bars in their damage order, temporary hit points first, running
 * their damage triggers. A creature that concentrates (a `concentration`
 * toggle or constant that is on) is reminded of its saving throw
 * (dealDamage). Its immunities, resistances and vulnerabilities to the
 * damage's type apply, as they do to a damage property's.
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
    amount = await applyDamageMultipliers({
      targetId, damage: amount, damageProp: { type: 'damage', damageType, tags: [] }, logValue,
    });
  }
  let amountMessage;
  if (healing) amountMessage = msg('logs.healingAmount', { amount });
  else if (damageType) amountMessage = msg('logs.damageAmount', { amount, type: damageTypeMessage(damageType) });
  else amountMessage = msg('logs.untypedDamageAmount', { amount });
  // Typed in by whoever deals it: no roll to hide from the target's players
  result.appendLog({
    ...logLine({
      name: msg(healing ? 'logs.healing' : 'logs.damage'),
      value: [amountMessage, ...logValue],
      inline: true,
      silenced: task.silent,
    }),
    targetView: WHOLE,
  }, [targetId]);

  // dealDamage only reads `healing` from the type, and whether it is silent
  await dealDamage(action, { damageType, silent: task.silent }, result, inputProvider, targetId, damageType || '', amount);
}
