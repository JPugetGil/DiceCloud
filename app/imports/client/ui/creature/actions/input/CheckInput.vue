<template>
  <div class="d-flex flex-wrap">
    <div class="d-flex flex-column justify-center align-center ma-2">
      <v-btn-toggle
        :model-value="modelValue.advantage"
        color="accent"
        @update:model-value="changeAdvantage"
      >
        <v-btn :value="-1">
          Disadvantage
        </v-btn>
        <v-btn :value="1">
          Advantage
        </v-btn>
      </v-btn-toggle>
      <div style="position: relative;">
        <v-scale-transition
          origin="center center"
        >
          <vertical-hex
            v-if="modelValue.advantage"
            id="extra-hex"
            style="position:absolute; transition: margin-left 0.3s ease;"
            :style="{marginLeft: modelValue.advantage == 1 ? '24px' : '-24px'}"
            disable-hover
          />
        </v-scale-transition>
        <vertical-hex
          id="roll-hex"
          @click="emit('continue')"
        >
          <div>
            Roll
          </div>
        </vertical-hex>
      </div>
    </div>
    <div class="d-flex flex-column mt-4 mr-4">
      <smart-select
        label="Ability"
        :items="abilityOptions"
        :value="modelValue.abilityVariableName"
        @change="(value, ack) => change('abilityVariableName', value, ack)"
      />
      <smart-select
        label="Skill"
        :items="skillOptions"
        :value="modelValue.skillVariableName"
        @change="(value, ack) => change('skillVariableName', value, ack)"
      />
      <text-field
        label="DC"
        :value="modelValue.dc"
        @change="(value, ack) => change('dc', value, ack)"
      />
    </div>
  </div>
</template>

<script setup>
import VerticalHex from '/imports/client/ui/components/VerticalHex.vue';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';

const props = defineProps({
  /**
    advantage: 0 | 1 | -1;
    skillVariableName?: string;
    abilityVariableName?: string;
    dc: number | null;
    contest?: true;
    targetSkillVariableName?: string;
    targetAbilityVariableName?: string;
  */
  modelValue: {
    type: Object,
    required: true,
  }
});

const emit = defineEmits(['update:modelValue', 'continue']);

// The checked creature's abilities and skills. A check task has no `prop` (it
// was read here, so the dialog failed as soon as it opened); its target is the
// creature being checked.
const creatureId = props.modelValue.targetIds?.[0];

const abilityOptions = createListOfProperties({
  attributeType: 'ability',
  'root.id': creatureId,
}, true);

const skillOptions = createListOfProperties({
  type: 'skill',
  'root.id': creatureId,
}, true);

function changeAdvantage(e) {
  const newValue = { ...props.modelValue, advantage: e };
  emit('update:modelValue', newValue);
}

function change(key, value, ack) {
  const newValue = { ...props.modelValue, [key]: value };
  emit('update:modelValue', newValue);
  ack();
}
</script>
