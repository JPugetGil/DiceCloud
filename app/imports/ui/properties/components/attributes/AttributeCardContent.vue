<template>
  <div
    class="d-flex flex-1-1 align-center"
    @click="$emit('click')"
    @mouseover="$emit('mouseover')"
    @mouseleave="$emit('mouseleave')"
  >
    <check-button
      v-if="model.attributeType === 'modifier' || model.type === 'skill'"
      :model="model"
      shape="tile"
      height="56"
      min-width="64"
      class="ma-2 flex-shrink-0"
      :inherit-color="!!model.color"
    >
      <span class="text-headline-medium">{{ computedValue }}</span>
    </check-button>
    <v-card-title
      v-else
      class="value text-headline-large flex-shrink-0"
    >
      {{ displayed.value }}<span
        v-if="displayed.unit"
        class="text-title-medium ml-1"
      >{{ displayed.unit }}</span>
    </v-card-title>
    <v-card-title class="name text-body-large text-truncate d-block pl-0">
      {{ model.name }}
      <v-icon
        v-if="model.advantage > 0"
        end
      >
        mdi-chevron-double-up
      </v-icon>
      <v-icon
        v-if="model.advantage < 0"
        end
      >
        mdi-chevron-double-down
      </v-icon>
    </v-card-title>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import CheckButton from '/imports/ui/properties/shared/CheckButton.vue';
import useUnits from '/imports/ui/composables/useUnits';
import { getAttributeUnit } from '/imports/api/utility/units';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['click', 'mouseover', 'mouseleave']);

const { quantityParts } = useUnits();

const computedValue = computed(() => {
  if (props.model.attributeType === 'modifier' || props.model.type === 'skill') {
    return numberToSignedString(props.model.value);
  } else {
    return props.model.value;
  }
});

// A distance or weight, in the user's units
const displayed = computed(() => props.model.type === 'attribute'
  ? quantityParts(props.model.value, getAttributeUnit(props.model))
  : { value: computedValue.value }
);
</script>

<style lang="css" scoped>
  .value {
    min-width: 72px;
    justify-content: center;
  }
</style>
