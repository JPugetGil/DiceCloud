import { getConstantValueFromScope, getFromScope } from '/imports/api/creature/creatures/scopeVariables';
import type { CreatureProperty } from '/imports/api/creature/creatureProperties/CreatureProperties';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import getEffectiveProperty from '/imports/api/engine/action/functions/getEffectiveProperty';
import { getVariables } from '/imports/api/engine/loadCreatures';

/*
 * Legendary Resistance (phase 3.3 of the monsters, Q6): "If the creature
 * fails a saving throw, it can choose to succeed instead", a few times a day.
 * A creature with a point of `legendaryResistance` left and the toggle
 * `useLegendaryResistance` on succeeds a saving throw it fails, and spends
 * the point (applySavingThrowProperty): the server decides at once, as the
 * game master would at the table, rather than asking them while a player
 * waits. The SRD 5.1 bestiary gives its 23 legendary monsters both, the
 * toggle on (tools/bestiary/convert.py); the game master turns it off on a
 * monster's sheet to keep its points for a decisive spell. A creature without
 * them, any character, saves as before.
 */

/** The resource a legendary resistance spends, by its variable name */
export const LEGENDARY_RESISTANCE = 'legendaryResistance';
/** The toggle that uses it by itself, by its variable name */
export const USE_LEGENDARY_RESISTANCE = 'useLegendaryResistance';

type Variable = {
  type?: string, inactive?: boolean, enabled?: boolean, disabled?: boolean, condition?: { value?: unknown },
};

// A toggle that is on: enabled, or neither enabled nor disabled and its
// condition holds; inactive, never
const toggleOn = (toggle: Variable) => !toggle.inactive
  && !!(toggle.enabled || (!toggle.disabled && toggle.condition?.value));

/**
 * The creature's legendary resistance, as the action has left it, when it
 * turns a failed saving throw into a success: the toggle on and a point left
 * after what the action spent already. Undefined otherwise, and where the
 * properties are not at hand: the browser's simulation of a creature whose
 * sheet it has not loaded, which the server's result replaces
 */
export async function usableLegendaryResistance(
  action: EngineAction, creatureId: string,
): Promise<CreatureProperty | undefined> {
  const scope = await getVariables(creatureId);
  if (!scope) return undefined;
  const use = await getFromScope(USE_LEGENDARY_RESISTANCE, scope);
  const on = use?.type === 'toggle'
    ? toggleOn(use)
    : !!await getConstantValueFromScope(USE_LEGENDARY_RESISTANCE, scope);
  if (!on) return undefined;
  const resource = await getFromScope(LEGENDARY_RESISTANCE, scope);
  if (resource?.type !== 'attribute' || !resource._id || resource.inactive) return undefined;
  const left = getEffectiveProperty(action, resource as CreatureProperty & { value?: number });
  if (!((left.value ?? 0) >= 1)) return undefined;
  return left;
}
