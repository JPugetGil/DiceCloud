import { getFromScope } from '/imports/api/creature/creatures/CreatureVariables';
import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { applyDefaultAfterPropTasks, applyTaskToEachTarget } from '/imports/api/engine/action/functions/applyTaskGroups';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import recalculateCalculation from '/imports/api/engine/action/functions/recalculateCalculation';
import { PropTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { getVariables } from '/imports/api/engine/loadCreatures';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';
import { isFiniteNode } from '/imports/parser/parseTree/constant';
import { Meteor } from 'meteor/meteor';

export default async function applySavingThrowProperty(
  task: PropTask, action: EngineAction, result: TaskResult, inputProvider: InputProvider
): Promise<void> {

  const prop = task.prop;

  if (prop.type !== 'savingThrow') {
    throw new Meteor.Error('wrong-property', `Expected a savingThrow, got ${prop.type} instead`);
  }

  const saveTargetIds = prop.target === 'self' ? [action.creatureId] : task.targetIds;

  if (saveTargetIds.length > 1) {
    return await applyTaskToEachTarget(action, task, saveTargetIds, inputProvider);
  }

  if (prop.dc) {
    await recalculateCalculation(prop.dc, action, 'reduce', inputProvider);
  }

  if (!isFiniteNode(prop.dc?.valueNode)) {
    result.appendLog({
      name: 'Error', i18n: { name: { key: 'logs.error' } },
      value: 'Saving throw requires a DC',
      silenced: prop.silent,
    }, saveTargetIds);
    return await applyDefaultAfterPropTasks(action, prop, saveTargetIds, inputProvider);
  }

  const dc = Number(prop.dc?.value ?? 0);
  result.appendLog(logLine({
    name: getPropertyTitle(prop),
    value: msg('logs.dc', { dc }),
    inline: true,
    silenced: prop.silent,
  }), saveTargetIds);

  const targetId = saveTargetIds[0];

  // If there are no save targets, apply all children as if the save both
  // succeeded and failed
  if (!targetId) {
    result.pushScope = {
      ['~saveFailed']: { value: true },
      ['~saveSucceeded']: { value: true },
    }
    return await applyDefaultAfterPropTasks(action, prop, saveTargetIds, inputProvider);
  }

  // Each target makes the saving throw
  const save = prop.stat ? await getFromScope(prop.stat, await getVariables(targetId)) : undefined;

  if (!save) {
    result.appendLog(logLine({
      name: msg('logs.saveError'),
      value: msg('logs.noSave', { stat: prop.stat }),
      silenced: prop.silent,
    }), [targetId]);
    return await applyDefaultAfterPropTasks(action, prop, [targetId], inputProvider);
  }

  const rollModifierText = numberToSignedString(save.value, true);
  const rollModifier = save.value;

  // The roll's lines: its advantage, if any, then its dice
  let value, resultPrefix;
  const rollParts: LogPart[] = [];
  if (save.advantage === 1) {
    const [[a, b]] = await inputProvider.rollDice([{ number: 2, diceSize: 20 }]);
    rollParts.push(msg('logs.advantage'));
    if (a >= b) {
      value = a;
      resultPrefix = `1d20 [ ${a}, ~~${b}~~ ] ${rollModifierText}`;
    } else {
      value = b;
      resultPrefix = `1d20 [ ~~${a}~~, ${b} ] ${rollModifierText}`;
    }
  } else if (save.advantage === -1) {
    const [[a, b]] = await inputProvider.rollDice([{ number: 2, diceSize: 20 }]);
    rollParts.push(msg('logs.disadvantage'));
    if (a <= b) {
      value = a;
      resultPrefix = `1d20 [ ${a}, ~~${b}~~ ] ${rollModifierText}`;
    } else {
      value = b;
      resultPrefix = `1d20 [ ~~${a}~~, ${b} ] ${rollModifierText}`;
    }
  } else {
    const [[rolledValue]] = await inputProvider.rollDice([{ number: 1, diceSize: 20 }]);
    value = rolledValue;
    resultPrefix = `1d20 [ ${value} ] ${rollModifierText}`
  }
  result.pushScope = {};
  result.pushScope['~saveDiceRoll'] = { value };
  const resultValue = value + rollModifier || 0;
  result.pushScope['~saveRoll'] = { value: resultValue };
  const saveSuccess = resultValue >= dc;
  if (saveSuccess) {
    result.pushScope['~saveSucceeded'] = { value: true };
    result.pushScope['~saveFailed'] = { value: false };
  } else {
    result.pushScope['~saveFailed'] = { value: true };
    result.pushScope['~saveSucceeded'] = { value: false };
  }
  result.appendLog(logLine({
    name: msg(saveSuccess ? 'logs.saveSucceeded' : 'logs.saveFailed'),
    value: [...rollParts, resultPrefix, `**${resultValue}**`],
    inline: true,
    silenced: prop.silent,
  }), [targetId]);
  return await applyDefaultAfterPropTasks(action, prop, [targetId], inputProvider);
}
