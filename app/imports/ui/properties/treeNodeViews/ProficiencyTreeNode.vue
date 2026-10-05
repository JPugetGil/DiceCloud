<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <proficiency-icon
      class="mr-2"
      :class="selected && 'text-primary'"
      :color="model.color"
      :value="model.value"
    />
    <div class="tree-node-text">
      <template v-if="!model.name && model.stats && model.stats.length">
        {{ model.stats.join(', ') }}
      </template>
      <template v-else>
        {{ title }}
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProficiencyIcon from '/imports/ui/properties/shared/ProficiencyIcon.vue';
import PROPERTIES from '/imports/constants/PROPERTIES';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
});

const title = computed(() => {
  const model = props.model;
  if (!model) return;
  if (model.name) return model.name;
  const prop = PROPERTIES[model.type];
  return prop && prop.name;
});
</script>
