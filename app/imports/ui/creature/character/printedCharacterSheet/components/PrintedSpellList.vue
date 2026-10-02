<template>
  <div
    class="octagon-border my-1"
    style="page-break-after: avoid;"
  >
    <div class="label text-center">
      {{ model.name }}
    </div>
    <!-- Only the values the list has: an empty label tells the reader nothing -->
    <div v-if="isSet(model.dc)">
      {{ $t('printed.spellSaveDc', { dc: model.dc.value }) }}
    </div>
    <div v-if="model.ability">
      {{ $t('printed.spellAbility', { ability: abilityName }) }}
    </div>
    <div v-if="model.ability && model.abilityMod !== undefined">
      {{ $t('printed.spellAbilityMod', { mod: model.abilityMod }) }}
    </div>
    <div v-if="isSet(model.attackRollBonus)">
      {{ $t('printed.spellAttackBonus', { bonus: model.attackRollBonus.value }) }}
    </div>
    <div v-if="isSet(model.maxPrepared)">
      {{ $t('printed.maxPrepared', { count: model.maxPrepared.value }) }}
    </div>
    <property-description
      text
      :model="model.description"
    />
  </div>
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const isSet = calculation => ![undefined, null, ''].includes(calculation?.value);

// The list stores its ability by variable name ("wisdom"): the reader wants
// the ability's own name ("Sagesse")
const abilityName = autorun(() => {
  const { ability, root } = props.model;
  if (!ability) return;
  return CreatureProperties.findOne({
    'root.id': root?.id,
    variableName: ability,
    type: 'attribute',
    removed: { $ne: true },
    overridden: { $ne: true },
  }, { fields: { name: 1 } })?.name || ability;
}).result;
</script>