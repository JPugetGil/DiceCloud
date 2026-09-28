<template>
  <svg-icon
    v-if="model.icon"
    :shape="model.icon.shape"
    :color="color"
    :class="{disabled}"
  />
  <v-icon
    v-else
    :color="color"
    :class="{disabled}"
  >
    {{ icon }}
  </v-icon>
</template>

<script setup>
import { computed } from 'vue';
import { getPropertyIcon } from '/imports/constants/PROPERTIES';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  color: {
    type: String,
    default: undefined,
  },
  disabled: Boolean,
});

const icon = computed(() => {
  return getPropertyIcon(props.model && props.model.type);
});
</script>

<style lang="css" scoped>
.svg-icon.disabled,
.v-icon.disabled {
  opacity: 0.2;
}
</style>
