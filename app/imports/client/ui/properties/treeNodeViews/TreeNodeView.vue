<template>
  <component
    :is="treeNodeView"
    :model="model"
    :selected="selected"
    :class="{
      'inactive': model.inactive,
    }"
    v-bind="$attrs"
  />
</template>

<script setup>
import { computed } from 'vue';
import treeNodeViewIndex from '/imports/client/ui/properties/treeNodeViews/treeNodeViewIndex';

// Not registering the index: `:is` below receives the component itself
defineOptions({
  name: 'TreeNodeView',
});

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  selected: Boolean,
});

const treeNodeView = computed(() => {
  let type = props.model.type;
  return treeNodeViewIndex[type] || treeNodeViewIndex.default;
});
</script>

<style lang="css" scoped>
  .inactive {
    opacity: 0.6;
  }
</style>
