<template>
  <div class="spell-list-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          :label="$t('forms.spellList.maxPrepared')"
          :hint="$t('forms.spellList.maxPreparedHint')"
          :model="model.maxPrepared"
          :error-messages="errors.maxPrepared"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['maxPrepared', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          :label="$t('forms.spellList.ability')"
          :value="model.ability"
          :hint="$t('forms.spellList.abilityHint')"
          :items="abilityScoreList"
          :error-messages="errors.ability"
          @change="changeAbility"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          :label="$t('forms.spellList.dc')"
          :hint="$t('forms.spellList.dcHint')"
          :model="model.dc"
          :error-messages="errors.dc"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['dc', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          :label="$t('forms.spellList.attackBonus')"
          :hint="$t('forms.spellList.attackBonusHint')"
          :model="model.attackRollBonus"
          :error-messages="errors.attackRollBonus"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['attackRollBonus', ...path], value, ack})"
        />
      </v-col>
    </v-row>

    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections
      v-if="$slots.default"
      type="spellList"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';

import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const abilityScoreList = autorun(() => {
  return createListOfProperties({
    type: 'attribute',
    attributeType: 'ability',
  });
}).result;

function changeAbility(value, ack) {
  emit('change', { path: ['ability'], value, ack });
  const oldValue = props.model.ability;

  const attackRollBonus = props.model.attackRollBonus?.calculation;
  if (
    value &&
    (!attackRollBonus ||
    attackRollBonus === `proficiencyBonus + ${oldValue}.modifier`)
  ) {
    emit('change', {
      path: ['attackRollBonus', 'calculation'],
      value: `proficiencyBonus + ${value}.modifier`
    });
  }

  const dc = props.model.dc?.calculation;
  if (
    value &&
    (!dc || 
    dc === `8 + proficiencyBonus + ${oldValue}.modifier`)
  ) {
    emit('change', {
      path: ['dc', 'calculation'],
      value: `8 + proficiencyBonus + ${value}.modifier`
    });
  }
}
</script>
