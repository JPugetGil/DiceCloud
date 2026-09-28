<template>
  <svg-icon
    :shape="shape"
  />
</template>

<script setup>
import { computed } from 'vue';
import SvgIcon from '/imports/client/ui/components/global/SvgIcon.vue'
import SVG_ICONS from '/imports/constants/SVG_ICONS';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
});

const shape = computed(() => {
  return SVG_ICONS[props.name].shape;
});
</script>

<style lang="css" scoped>
</style>
