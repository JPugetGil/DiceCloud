import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

/**
 * What a table checks in a fight (D1), found by the variable names the
 * libraries use: hit points (the `hitPoints` health bar, else the first),
 * temporary hit points when there are some, armor class, initiative, speed,
 * proficiency bonus and passive Perception (10 + Perception + its passive
 * bonus). Active properties only, as the sheet shows them.
 */
const VARIABLES = ['armor', 'initiative', 'speed', 'proficiencyBonus', 'perception'];
const TEMP_HIT_POINTS = /^temp(HP|HitPoints)$/i;

export default function useCombatStats(getCreatureId) {
  const found = autorun(() => {
    const creatureId = getCreatureId();
    if (!creatureId) return {};
    const active = {
      'root.id': creatureId,
      removed: { $ne: true },
      inactive: { $ne: true },
      overridden: { $ne: true },
    };
    const byVariable = {};
    CreatureProperties.find({ ...active, variableName: { $in: VARIABLES } }, { sort: { left: 1 } })
      .forEach(prop => { byVariable[prop.variableName] ??= prop; });
    const healthBars = CreatureProperties.find({
      ...active, type: 'attribute', attributeType: 'healthBar',
    }, { sort: { left: 1 } }).fetch();
    return { byVariable, healthBars };
  }).result;

  return computed(() => {
    const { byVariable = {}, healthBars = [] } = found.value || {};
    const hitPoints = healthBars.find(bar => bar.variableName === 'hitPoints') || healthBars[0];
    const tempHitPoints = healthBars.find(bar => TEMP_HIT_POINTS.test(bar.variableName || ''));
    const perception = byVariable.perception;
    return {
      hitPoints,
      tempHitPoints,
      armor: byVariable.armor,
      initiative: byVariable.initiative,
      speed: byVariable.speed,
      proficiencyBonus: byVariable.proficiencyBonus,
      perception,
      passivePerception: perception
        ? 10 + (perception.value || 0) + (perception.passiveBonus || 0)
        : undefined,
    };
  });
}
