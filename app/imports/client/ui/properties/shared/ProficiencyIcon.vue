<template>
  <v-icon v-if="value !== undefined">
    {{ displayedIcon }}
  </v-icon>
</template>

<script setup>
import { computed } from 'vue';
import getProficiencyIcon from '/imports/client/ui/utility/getProficiencyIcon';

const props = defineProps({
  value: {
    type: Number,
    default: undefined,
  },
});

const displayedIcon = computed(() => {
  return getProficiencyIcon(props.value);
});
</script>
