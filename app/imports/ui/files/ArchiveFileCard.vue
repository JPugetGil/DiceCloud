<template>
  <v-card :data-id="`${model._id}-archive-card`">
    <v-card-title>
      {{ model.meta.creatureName }}
    </v-card-title>
    <v-card-subtitle>
      {{ model.size }}
    </v-card-subtitle>
    <v-card-actions>
      <v-btn
        variant="text"
        :loading="restoreLoading"
        @click="restore(model._id)"
      >
        {{ $t('common.restore') }}
      </v-btn>
      <div class="flex-1-1" />
      <v-tooltip
        v-if="missingFromStorage"
        :text="$t('files.notInStorage')"
        location="top"
      >
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            class="mr-2"
            color="error"
            :aria-label="$t('files.notInStorage')"
            icon="mdi-cloud-alert"
          />
        </template>
      </v-tooltip>
      <v-btn
        variant="text"
        icon
        @click="removeArchiveCharacter"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        :href="`${model.link}?download=true`"
      >
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import restoreCreatureFromFile from '/imports/api/creature/archive/methods/restoreCreatureFromFile';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import removeArchiveCreature from '/imports/api/creature/archive/methods/removeArchiveCreature';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import isMissingFromStorage from '/imports/api/files/isMissingFromStorage';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const restoreLoading = ref(false);

const missingFromStorage = computed(() => isMissingFromStorage(props.model));


const dialogStackStore = useDialogStackStore();

async function restore() {
  restoreLoading.value = true;
  try {
    await restoreCreatureFromFile.callAsync({ fileId: props.model._id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason });
  } finally {
    restoreLoading.value = false;
  }
}

function removeArchiveCharacter() {
  dialogStackStore.pushDialogStack({
    component: 'delete-confirmation-dialog',
    elementId: `${props.model._id}-archive-card`,
    data: {
      name: props.model.meta.creatureName,
      typeName: t('files.characterArchive')
    },
    async callback(confirmation) {
      if (!confirmation) return;
      try {
        await removeArchiveCreature.callAsync({ fileId: props.model._id });
      } catch (error) {
        console.error(error);
      }
    }
  });
}
</script>
