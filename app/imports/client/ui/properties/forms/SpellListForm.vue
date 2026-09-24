<template>
  <div class="spell-list-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="Maximum prepared spells"
          hint="How many spells can be prepared"
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
          label="Spellcasting ability"
          :value="model.ability"
          hint="Which ability is used to cast spells in this spell list"
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
          label="Spell save DC"
          hint="The spell save DC of spells in this list"
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
          label="Attack roll bonus"
          hint="The attack roll bonus of spell attacks made by spells in this list"
          :model="model.attackRollBonus"
          :error-messages="errors.attackRollBonus"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['attackRollBonus', ...path], value, ack})"
        />
      </v-col>
    </v-row>

    <inline-computation-field
      label="Description"
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
