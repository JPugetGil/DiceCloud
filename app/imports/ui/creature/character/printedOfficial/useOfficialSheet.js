import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

const COIN_TAGS = ['platinum', 'gold', 'electrum', 'silver', 'copper'];

/**
 * What the official-looking sheet prints, read as the classic printed sheet
 * reads it (PrintedStats.vue): active, not overridden, not hidden when the
 * character hides unused stats, and nothing the Build tab holds (a library's
 * guide, its ability score tools).
 */
export default function useOfficialSheet(creatureIdRef) {
  const creature = autorun(() => Creatures.findOne(creatureIdRef.value)).result;
  const variables = autorun(() => CreatureVariables.findOne({ _creatureId: creatureIdRef.value }) || {}).result;
  const all = autorun(() => CreatureProperties.find({
    ...getFilter.descendantsOfRoot(creatureIdRef.value),
    removed: { $ne: true },
  }, { sort: { left: 1 } }).fetch()).result;

  const buildFolders = computed(() => (all.value || []).filter(prop => prop.type === 'folder'
    && prop.groupStats && prop.hideStatsGroup && prop.tab === 'build'));
  const inside = (doc, ancestor) => ancestor.left < doc.left && ancestor.right > doc.right;
  const shown = computed(() => (all.value || []).filter(prop => !prop.inactive && !prop.overridden
    && !(creature.value?.settings?.hideUnusedStats && prop.hide)
    && !(prop.hideWhenTotalZero && prop.total === 0) && !(prop.hideWhenValueZero && prop.value === 0)
    && !buildFolders.value.some(folder => inside(prop, folder))));
  const of = (type, field, value) => computed(() => shown.value.filter(prop => prop.type === type
    && (field === undefined || prop[field] === value)));
  // An attribute, or a skill: initiative is a check in some libraries
  const byVariable = name => computed(() => shown.value.find(prop => prop.variableName === name
    && (prop.type === 'attribute' || prop.type === 'skill')));
  const descendants = parent => (all.value || []).filter(prop => inside(prop, parent));

  const abilities = of('attribute', 'attributeType', 'ability');
  const saves = of('skill', 'skillType', 'save');
  const skills = of('skill', 'skillType', 'skill');
  const hitDice = of('attribute', 'attributeType', 'hitDice');
  const resources = of('attribute', 'attributeType', 'resource');
  const spellSlots = of('attribute', 'attributeType', 'spellSlot');
  const features = of('feature');
  const spellLists = of('spellList');

  const proficiencyNames = skillType => computed(() => shown.value
    .filter(prop => prop.type === 'skill' && prop.skillType === skillType && prop.proficiency)
    .map(prop => prop.name).filter(Boolean));

  // Spells: every one the character can see, prepared or not, outside items
  // left behind and toggles turned off
  const spells = computed(() => (all.value || []).filter(prop => prop.type === 'spell'
    && !prop.deactivatedByAncestor && !prop.deactivatedByToggle));

  // Attacks: actions and spells with an attack roll, each with its damage
  // (an action's children are never active: read them all)
  const attacks = computed(() => [
    ...shown.value.filter(prop => prop.type === 'action' && Number.isFinite(prop.attackRoll?.value)),
    ...spells.value.filter(spell => Number.isFinite(spell.attackRoll?.value)
      && /attackRollBonus/.test(spell.attackRoll.calculation || '')),
  ].sort((a, b) => a.left - b.left).map(prop => ({
    _id: prop._id,
    name: prop.name,
    bonus: prop.attackRoll.value,
    damages: descendants(prop).filter(child => child.type === 'damage'),
  })));

  const items = computed(() => (all.value || []).filter(prop => prop.type === 'item'
    && !prop.deactivatedByAncestor && !prop.deactivatedByToggle
    && !(prop.tags || []).some(tag => COIN_TAGS.includes(tag))));
  const coins = computed(() => COIN_TAGS.map(tag => {
    const coin = (all.value || []).find(prop => prop.type === 'item' && (prop.tags || []).includes(tag));
    return { tag, quantity: coin?.quantity || 0, name: coin?.name };
  }));

  return {
    creature, variables, abilities, saves, skills, hitDice, resources, spellSlots, features,
    spellLists, spells, attacks, items, coins,
    armor: byVariable('armor'),
    initiative: byVariable('initiative'),
    speed: byVariable('speed'),
    proficiencyBonus: byVariable('proficiencyBonus'),
    hitPoints: byVariable('hitPoints'),
    darkvision: byVariable('darkvision'),
    armorProficiencies: proficiencyNames('armor'),
    weaponProficiencies: proficiencyNames('weapon'),
    toolProficiencies: proficiencyNames('tool'),
    languages: proficiencyNames('language'),
    perception: computed(() => skills.value.find(skill => skill.variableName === 'perception')),
  };
}
