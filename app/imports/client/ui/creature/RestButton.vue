<template>
  <v-btn
    :loading="loading"
    :disabled="context.editPermission === false"
    variant="outlined"
    :data-id="`rest-btn-${type}`"
    style="width: 160px;"
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
import doAction from '/imports/client/ui/creature/actions/doAction';

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

const loading = ref(false);

async function rest() {
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
  }).finally(() => {
    loading.value = false;
  });
}
</script>
