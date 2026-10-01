<template>
  <v-btn
    :disabled="context.editPermission === false"
    :data-id="`event-btn-${model._id}`"
    :variant="model.color ? 'flat' : 'tonal'"
    class="event-button"
    :class="textClass"
    block
    :color="model.color"
    @click="doAction"
  >
    <property-icon
      style="margin-left: -4px; margin-right: 8px;"
      :model="model"
    />
    <div
      class="text-truncate"
    >
      {{ model.name }}
    </div>
  </v-btn>
</template>

<script setup>
import { ref, inject, computed } from 'vue';
import doActionApi from '/imports/ui/creature/actions/doAction';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import isDarkColor from '/imports/ui/utility/isDarkColor';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

// A library's colour fills the button; its text is black or white, whichever
// reads on it (DESIGN_SYSTEM.md, rule 2). Vuetify's own pick put white on
// orange at 3.2:1
const textClass = computed(() => {
  if (!props.model.color) return undefined;
  return isDarkColor(props.model.color) ? 'text-white' : 'text-black';
});

const loading = ref(false);

async function doAction() {
  loading.value = true;
  await doActionApi({
    propId: props.model._id,
    creatureId: props.model.root.id,
    elementId: `event-btn-${props.model._id}`,
    targetIds: [],
  }).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }).finally(() => {
    loading.value = false;
  });
}
</script>

<style lang="css">
.event-button .v-btn__content {
  max-width: 100%;
}
</style>
