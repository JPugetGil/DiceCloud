import { getFromScope } from '/imports/api/creature/creatures/scopeVariables';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { applyDefaultAfterPropTasks, applyTaskToEachTarget, spendAttribute } from '/imports/api/engine/action/functions/applyTaskGroups';
import { usableLegendaryResistance } from '/imports/api/engine/action/functions/legendaryResistance';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import recalculateCalculation from '/imports/api/engine/action/functions/recalculateCalculation';
import type { PropTask } from '/imports/api/engine/action/tasks/Task';
import type TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { getVariables } from '/imports/api/engine/loadCreatures';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';
import { WHOLE } from '/imports/api/creature/log/logViews';
import { targetName, targetSight } from '/imports/api/engine/action/functions/hiddenStats';
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

  // The actor's own property's error
  if (!isFiniteNode(prop.dc?.valueNode)) {
    result.appendLog({
      name: 'Error', i18n: { name: { key: 'logs.error' } },
      value: 'Saving throw requires a DC',
      silenced: prop.silent,
      hiddenTargetView: WHOLE,
    }, saveTargetIds);
    return await applyDefaultAfterPropTasks(action, prop, saveTargetIds, inputProvider);
  }

  // Its DC, and below the target's roll: the target's players read both
  // whole; the actor's, the DC, theirs (logViews.ts)
  const dc = Number(prop.dc?.value ?? 0);
  result.appendLog({
    ...logLine({
      name: getPropertyTitle(prop),
      value: msg('logs.dc', { dc }),
      inline: true,
      silenced: prop.silent,
    }),
    targetView: WHOLE,
    hiddenTargetView: WHOLE,
  }, saveTargetIds);

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

  // A target hidden from the actor's readers, a game master's monster
  // against a player's character (phase 2.3): the browser's simulation
  // leaves its saving throw to the server, neither made nor failed, so that
  // no branch applies on a guess. Its name, which the players read on the
  // board, says whose
  const sight = await targetSight(action, targetId, inputProvider);
  if (sight === 'unresolved') {
    result.pushScope = {
      '~saveFailed': {}, '~saveSucceeded': {}, '~saveRoll': {}, '~saveDiceRoll': {},
    };
    result.appendLog({
      ...logLine({
        name: msg('logs.forTarget', { target: await targetName(action, targetId), name: msg('logs.saveAtResolution') }),
        inline: true,
        silenced: prop.silent,
      }),
      hiddenTargetView: WHOLE,
    }, [targetId]);
    return await applyDefaultAfterPropTasks(action, prop, [targetId], inputProvider);
  }

  // Each target makes the saving throw
  const save = prop.stat ? await getFromScope(prop.stat, await getVariables(targetId)) : undefined;

  if (!save) {
    // What the target's sheet lacks: its own, never for the readers it is
    // hidden from
    result.appendLog({
      ...logLine({
        name: msg('logs.saveError'),
        value: msg('logs.noSave', { stat: prop.stat ?? '' }),
        silenced: prop.silent,
      }),
      targetView: WHOLE,
    }, [targetId]);
    return await applyDefaultAfterPropTasks(action, prop, [targetId], inputProvider);
  }

  const rollModifierText = numberToSignedString(save.value, true);
  const rollModifier = save.value;

  // The dice of a hidden target's saving throw come from a stream of their
  // own, which the browser can never draw (server/actionDice.ts): the player
  // cannot learn the monster's d20 in advance, and the actor's dice keep
  // their positions whether it rolls or not
  const rollDice: InputProvider['rollDice'] = sight === 'hidden' && inputProvider.rollHiddenDice
    ? dice => inputProvider.rollHiddenDice!(targetId, dice)
    : dice => inputProvider.rollDice(dice);

  // The roll's lines: its advantage, if any, then its dice
  let value, resultPrefix;
  const rollParts: LogPart[] = [];
  if (save.advantage === 1) {
    const [[a, b]] = await rollDice([{ number: 2, diceSize: 20 }]);
    rollParts.push(msg('logs.advantage'));
    if (a >= b) {
      value = a;
      resultPrefix = `1d20 [ ${a}, ~~${b}~~ ] ${rollModifierText}`;
    } else {
      value = b;
      resultPrefix = `1d20 [ ~~${a}~~, ${b} ] ${rollModifierText}`;
    }
  } else if (save.advantage === -1) {
    const [[a, b]] = await rollDice([{ number: 2, diceSize: 20 }]);
    rollParts.push(msg('logs.disadvantage'));
    if (a <= b) {
      value = a;
      resultPrefix = `1d20 [ ${a}, ~~${b}~~ ] ${rollModifierText}`;
    } else {
      value = b;
      resultPrefix = `1d20 [ ~~${a}~~, ${b} ] ${rollModifierText}`;
    }
  } else {
    const [[rolledValue]] = await rollDice([{ number: 1, diceSize: 20 }]);
    value = rolledValue;
    resultPrefix = `1d20 [ ${value} ] ${rollModifierText}`
  }
  const resultValue = value + rollModifier || 0;
  const rolledSuccess = resultValue >= dc;
  // A target that fails, with a legendary resistance left and used by itself,
  // succeeds instead and spends a point (phase 3.3, legendaryResistance.ts):
  // the line says so to whoever reads it, as the game master would at the
  // table; the roll stays the target's readers'
  const resistance = rolledSuccess ? undefined : await usableLegendaryResistance(action, targetId);
  const saveSuccess = rolledSuccess || !!resistance;
  // The actor's scope: the result alone for a hidden target, never its roll,
  // which formulas would print in the actor's log (blanked, not another
  // target's from before)
  result.pushScope = sight === 'hidden'
    ? { '~saveDiceRoll': {}, '~saveRoll': {} }
    : { '~saveDiceRoll': { value }, '~saveRoll': { value: resultValue } };
  result.pushScope['~saveSucceeded'] = { value: saveSuccess };
  result.pushScope['~saveFailed'] = { value: !saveSuccess };
  const outcome = msg(resistance ? 'logs.legendaryResistance' : saveSuccess ? 'logs.saveSucceeded' : 'logs.saveFailed');
  result.appendLog({
    ...logLine({
      name: outcome,
      value: [...rollParts, resultPrefix, `**${resultValue}**`],
      inline: true,
      silenced: prop.silent,
    }),
    // The target's own roll, whole to its readers. The actor's read whose
    // saving throw it was, and whether it was made: never the roll
    targetView: WHOLE,
    hiddenTargetView: logLine({
      name: msg('logs.forTarget', { target: await targetName(action, targetId), name: outcome }),
    }),
  }, [targetId]);
  // The point spent, on the target: a line of its own readers' alone
  if (resistance) await spendAttribute(action, targetId, resistance, 1, inputProvider, { silent: !!prop.silent });
  return await applyDefaultAfterPropTasks(action, prop, [targetId], inputProvider);
}
