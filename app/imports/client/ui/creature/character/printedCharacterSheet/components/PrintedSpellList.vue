<template>
  <div
    class="octagon-border my-1"
    style="page-break-after: avoid;"
  >
    <div class="label text-center">
      {{ model.name }}
    </div>
    <div>
      {{ $t('printed.spellSaveDc', { dc: model.dc && model.dc.value }) }}
    </div>
    <div v-if="model.ability">
      {{ $t('printed.spellAbility', { ability: model.ability }) }}
    </div>
    <div v-if="model.ability">
      {{ $t('printed.spellAbilityMod', { mod: model.abilityMod }) }}
    </div>
    <div>
      {{ $t('printed.spellAttackBonus', { bonus: model.attackRollBonus && model.attackRollBonus.value }) }}
    </div>
    <div>
      {{ $t('printed.maxPrepared', { count: model.maxPrepared && model.maxPrepared.value }) }}
    </div>
    <property-description
      text
      :model="model.description"
    />
  </div>
</template>

<script setup>
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>