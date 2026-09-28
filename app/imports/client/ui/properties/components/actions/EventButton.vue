<template>
  <v-btn
    :disabled="context.editPermission === false"
    :data-id="`event-btn-${model._id}`"
    variant="outlined"
    class="event-button"
    style="min-width: 160px; max-width: 100%;"
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
import { ref, inject } from 'vue';
import doActionApi from '/imports/client/ui/creature/actions/doAction';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

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
