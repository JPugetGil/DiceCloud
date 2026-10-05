<template>
  <v-btn
    :loading="loading"
    :disabled="context.editPermission === false"
    variant="tonal"
    :data-id="`rest-btn-${type}`"
    block
    @click="rest"
  >
    <v-icon start>
      {{ type === 'shortRest' ? 'mdi-music-rest-quarter' : 'mdi-bed' }}
    </v-icon>
    {{ type === 'shortRest' ? $t('common.shortRestTitle') : $t('common.longRestTitle') }}
  </v-btn>
</template>

<script setup>
import { ref, inject } from 'vue';
import doAction from '/imports/ui/creature/actions/doAction';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  creatureId: {
    type: String,
    required: true,
  },
});

const context = inject('context', {});
const dialogStackStore = useDialogStackStore();

const loading = ref(false);

// A long rest shows what it will restore first (UX8); a short rest, often
// taken in play and restoring little, goes at once
function rest() {
  if (props.type !== 'longRest') return takeRest();
  dialogStackStore.pushDialogStack({
    component: 'rest-dialog',
    elementId: `rest-btn-${props.type}`,
    data: { creatureId: props.creatureId, type: props.type },
    callback(confirmed) {
      if (confirmed) takeRest();
    },
  });
}

async function takeRest() {
  loading.value = true;
  await doAction({
    creatureId: props.creatureId,
    elementId: `rest-btn-${props.type}`,
    task: {
      subtaskFn: 'reset',
      targetIds: [props.creatureId],
      eventName: props.type,
    },
  }).catch(e => {
    console.error(e);
    snackbar({ text: e.reason || e.message || e.toString() });
  }).finally(() => {
    loading.value = false;
  });
}
</script>
