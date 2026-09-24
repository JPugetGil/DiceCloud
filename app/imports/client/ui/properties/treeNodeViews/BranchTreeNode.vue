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
      {{ name }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const name = computed(() => {
  switch(props.model.branchType){
    case 'if': return 'On condition';
    case 'hit': return 'On hit';
    case 'miss': return 'On miss';
    case 'failedSave': return 'On failed save';
    case 'successfulSave': return 'On save';
    case 'eachTarget': return 'Each target';
    case 'random': return 'Pick one at random';
    case 'index': return 'Pick one by index';
    case 'choice': return 'User choice';
    default: return '';
  }
});
</script>
