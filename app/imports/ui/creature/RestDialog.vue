<template>
  <!--
    A long rest, previewed before it is taken (UX8): the engine simulates it,
    as it would run, and the dialog lists what it would restore. Nothing is
    saved until "Rest". There is no undo afterwards: a rest's triggers can add
    or remove properties and roll dice, and its log may already be on Discord;
    putting all of that back exactly, without undoing what changed since, is
    not something the engine can do
  -->
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ type === 'shortRest' ? $t('common.shortRestTitle') : $t('common.longRestTitle') }}
      </v-toolbar-title>
    </template>
    <div data-id="rest-preview">
      <p class="text-body-large mt-0 mb-3">
        {{ $t('rest.previewIntro') }}
      </p>
      <div
        v-if="loading"
        class="d-flex justify-center pa-4"
      >
        <v-progress-circular
          indeterminate
          :aria-label="$t('rest.previewLoading')"
        />
      </div>
      <v-alert
        v-else-if="failed"
        type="warning"
        variant="tonal"
        density="compact"
      >
        {{ $t('rest.previewFailed') }}
      </v-alert>
      <template v-else>
        <v-card
          variant="tonal"
          class="pa-3"
        >
          <log-content :model="contents" />
        </v-card>
        <p
          v-if="needsInput"
          class="text-body-medium text-medium-emphasis mt-3 mb-0"
        >
          {{ $t('rest.previewNeedsInput') }}
        </p>
      </template>
    </div>
    <template #actions>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="flat"
        color="primary"
        :prepend-icon="type === 'shortRest' ? 'mdi-music-rest-quarter' : 'mdi-bed'"
        :disabled="!creatureId"
        data-id="rest-confirm"
        @click="dialogStackStore.popDialogStack(true)"
      >
        {{ $t('rest.confirm') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import LogContent from '/imports/ui/log/LogContent.vue';
import previewAction from '/imports/ui/creature/actions/previewAction';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const props = defineProps({
  creatureId: {
    type: String,
    default: undefined,
  },
  // 'longRest' or 'shortRest'
  type: {
    type: String,
    default: 'longRest',
  },
});

const dialogStackStore = useDialogStackStore();

const loading = ref(true);
const failed = ref(false);
const contents = ref([]);
const needsInput = ref(false);

onMounted(async () => {
  if (!props.creatureId) {
    loading.value = false;
    failed.value = true;
    return;
  }
  try {
    const preview = await previewAction({
      creatureId: props.creatureId,
      task: {
        subtaskFn: 'reset',
        targetIds: [props.creatureId],
        eventName: props.type,
      },
    });
    contents.value = preview.contents;
    needsInput.value = preview.needsInput;
  } catch (error) {
    console.error(error);
    failed.value = true;
  } finally {
    loading.value = false;
  }
});
</script>
