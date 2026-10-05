<template>
  <div class="default-tree-node d-flex flex-1-1 align-center justify-start">
    <property-icon
      class="mr-2"
      :model="model"
      :color="model.color"
      :class="selected && 'text-primary'"
    />
    <div class="text-no-wrap text-truncate">
      {{ title }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
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

<style scoped>
/* A flex item keeps its content's width unless allowed to shrink: without
   this, long names ran past the card instead of truncating */
.default-tree-node {
  min-width: 0;
}
</style>
