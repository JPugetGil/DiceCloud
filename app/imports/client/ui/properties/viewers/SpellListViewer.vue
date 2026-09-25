<template>
  <div class="spell-list-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />

      <property-field
        :name="$t('forms.spellList.maxPrepared')"
        large
        center
        :calculation="model.maxPrepared"
      />
      <property-field
        :name="$t('forms.spellList.ability')"
        mono
        :value="model.ability"
      />
      <property-field
        :name="$t('viewers.spellcastingAbilityMod')"
        large
        center
        signed
        :value="model.abilityMod"
      />
      <property-field
        :name="$t('viewers.spellSaveDc')"
        large
        center
        :calculation="model.dc"
      />
      <property-field
        :name="$t('forms.spellList.attackBonus')"
        large
        center
        signed
        :calculation="model.attackRollBonus"
      />
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>
