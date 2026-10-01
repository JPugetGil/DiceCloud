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
      {{ computedValue }}
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

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['click', 'mouseover', 'mouseleave']);

const computedValue = computed(() => {
  if (props.model.attributeType === 'modifier' || props.model.type === 'skill') {
    return numberToSignedString(props.model.value);
  } else {
    return props.model.value;
  }
});
</script>

<style lang="css" scoped>
  .value {
    min-width: 72px;
    justify-content: center;
  }
</style>
