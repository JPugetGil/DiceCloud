<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <property-icon
      v-if="!hideIcon"
      class="mr-2"
      :model="model"
      :color="model.color"
      :class="selected && 'text-primary'"
    />
    <div class="text-no-wrap text-truncate">
      <template v-if="model.dc && Number.isFinite(model.dc.value)">
        {{ $t('treeNodes.dc', { dc: model.dc.value }) }}
      </template>
      {{ title }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PROPERTIES from '/imports/constants/PROPERTIES';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const title = computed(() => {
  let model = props.model;
  if (!model) return;
  if (model.name) return model.name;
  if (model.stat) return model.stat;
  let prop = PROPERTIES[model.type]
  return prop && prop.name;
});
</script>
