<template>
  <div class="d-flex flex-wrap">
    <div class="d-flex flex-column justify-center align-center ma-2">
      <v-btn-toggle
        :model-value="model.advantage"
        color="accent"
        @update:model-value="changeAdvantage"
      >
        <v-btn :value="-1">
          {{ $t('common.disadvantage') }}
        </v-btn>
        <v-btn :value="1">
          {{ $t('common.advantage') }}
        </v-btn>
      </v-btn-toggle>
      <div style="position: relative;">
        <v-scale-transition
          origin="center center"
        >
          <vertical-hex
            v-if="model.advantage"
            id="extra-hex"
            style="position:absolute; transition: margin-left 0.3s ease;"
            :style="{marginLeft: model.advantage == 1 ? '24px' : '-24px'}"
            disable-hover
          />
        </v-scale-transition>
        <vertical-hex
          id="roll-hex"
          @click="emit('continue')"
        >
          <div>
            {{ $t('common.roll') }}
          </div>
        </vertical-hex>
      </div>
    </div>
    <div class="d-flex flex-column mt-4 mr-4">
      <smart-select
        :label="$t('check.ability')"
        :items="abilityOptions"
        :model-value="model.abilityVariableName"
        @change="(value, ack) => change('abilityVariableName', value, ack)"
      />
      <smart-select
        :label="$t('check.skill')"
        :items="skillOptions"
        :model-value="model.skillVariableName"
        @change="(value, ack) => change('skillVariableName', value, ack)"
      />
      <text-field
        :label="$t('check.dc')"
        :model-value="model.dc"
        @change="(value, ack) => change('dc', value, ack)"
      />
    </div>
  </div>
</template>

<script setup>
import VerticalHex from '/imports/ui/components/VerticalHex.vue';
import createListOfProperties from '/imports/ui/properties/forms/shared/lists/createListOfProperties';

const model = defineModel({
  /**
    advantage: 0 | 1 | -1;
    skillVariableName?: string;
    abilityVariableName?: string;
    dc: number | null;
    contest?: true;
    targetSkillVariableName?: string;
    targetAbilityVariableName?: string;
  */
  type: Object,
  required: true,
});

const emit = defineEmits(['continue']);

// The checked creature's abilities and skills. A check task has no `prop` (it
// was read here, so the dialog failed as soon as it opened); its target is the
// creature being checked.
const creatureId = model.value.targetIds?.[0];

const abilityOptions = createListOfProperties({
  attributeType: 'ability',
  'root.id': creatureId,
}, true);

const skillOptions = createListOfProperties({
  type: 'skill',
  'root.id': creatureId,
}, true);

function changeAdvantage(e) {
  model.value = { ...model.value, advantage: e };
}

function change(key, value, ack) {
  model.value = { ...model.value, [key]: value };
  ack();
}
</script>
