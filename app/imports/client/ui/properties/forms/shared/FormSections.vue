<template>
  <v-expansion-panels
    v-model="expand"
    variant="accordion"
    tile
    multiple
  >
    <slot />
  </v-expansion-panels>
</template>

<script setup lang="js">
import { ref, watch } from 'vue';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const props = defineProps({
  type: {
    type: String,
    default: undefined,
  },
});

const appStore = useAppStore();

// A copy: the panels write to this model, and only settled values are stored
const expand = ref([...appStore.formExpansionByType(props.type)]);

watch(expand, value => {
  if (!props.type) return;
  appStore.setFormExpansion({ type: props.type, value });
});
</script>
