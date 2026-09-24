<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <property-icon
      v-if="!hideIcon"
      class="mr-2"
      :model="model"
      :color="model.color"
      :class="selected && 'text-primary'"
    />
    <v-icon
      v-if="model.equipped && !hideIcon"
      class="mr-2"
      :class="selected && 'text-primary'"
      size="small"
    >
      mdi-account-arrow-left
    </v-icon>
    <div
      class="text-no-wrap text-truncate"
      :class="model.equipped && 'body-2'"
    >
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
  if (Number.isFinite(model.quantity) && model.quantity !== 1){
    if (model.plural){
      return `${model.quantity} ${model.plural}`;
    } else if (model.name){
      return `${model.quantity} ${model.name}`;
    }
  } else if (model.name) {
    return model.name;
  }
  let prop = PROPERTIES[model.type]
  return prop && prop.name;
});
</script>

<style lang="css" scoped>
</style>
