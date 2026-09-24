<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <property-icon
      v-if="!hideIcon"
      class="mr-2"
      :model="model"
      :color="model.color"
      :class="selected && 'text-primary'"
    />
    <tree-node-view
      v-if="model.cache && model.cache.node && model.cache.node.type !== 'reference'"
      :model="model.cache.node"
    />
    <div
      v-else
      class="text-no-wrap text-truncate"
    >
      {{ model.cache.node && model.cache.node.name || title }}
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import PROPERTIES from '/imports/constants/PROPERTIES';

// TreeNodeView reaches this component back through treeNodeViewIndex; an async
// component breaks that circular import the way Vue 3 documents
const TreeNodeView = defineAsyncComponent(
  () => import('/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue')
);

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const title = computed(() => {
  const model = props.model;
  if (!model) return;
  if (model.name) return model.name;
  const prop = PROPERTIES[model.type];
  return prop && prop.name;
});
</script>
