<template>
  <div
    class="d-flex flex-column justify-center"
    :style="dense ? undefined : 'min-height: 60px;'"
  >
    <v-list-item-title class="d-flex align-center">
      <div
        v-if="!renaming"
        class="text-truncate text-no-wrap"
      >
        {{ model.name }}
      </div>
      <text-field
        v-if="renaming"
        ref="nameInput"
        v-model="newName"
        regular
        hide-details
        density="compact"
        @click.stop=""
        @keydown.stop=""
        @keyup.stop="e => e.key === 'Enter' && (renaming = false)"
      />
      <v-spacer />
      <v-btn
        v-if="!selection"
        variant="text"
        icon
        :size="dense ? 'small' : undefined"
        style="flex-grow: 0"
        :to="`/party/${model._id}`"
        :aria-label="$t('party.openBoard')"
        :data-id="`party-board-${model._id}`"
        @click.stop
      >
        <v-icon>mdi-view-dashboard-outline</v-icon>
        <v-tooltip
          activator="parent"
          location="top"
          :text="$t('party.openBoard')"
        />
      </v-btn>
      <template v-if="!selection && !dense">
        <v-btn
          v-if="renaming || open"
          variant="text"
          icon
          style="flex-grow: 0"
          :aria-label="$t('characterList.renameFolder')"
          :data-id="`rename-folder-${model._id}`"
          @click.stop="renaming = !renaming"
        >
          <v-icon v-if="renaming">
            mdi-check
          </v-icon>
          <v-icon v-else>
            mdi-pencil-outline
          </v-icon>
          <v-tooltip
            activator="parent"
            location="top"
            :text="$t('characterList.renameFolder')"
          />
        </v-btn>
        <v-btn
          v-if="open"
          variant="text"
          icon
          style="flex-grow: 0"
          :aria-label="$t('characterList.deleteFolder')"
          :data-id="`delete-folder-${model._id}`"
          @click.stop="removeFolder"
        >
          <v-icon>mdi-delete-outline</v-icon>
          <v-tooltip
            activator="parent"
            location="top"
            :text="$t('characterList.deleteFolder')"
          />
        </v-btn>
      </template>
    </v-list-item-title>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import updateCreatureFolderName from '/imports/api/creature/creatureFolders/methods/updateCreatureFolderName';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  open: Boolean,
  selection: Boolean,
  dense: Boolean,
});

const { t } = useI18n();

const renaming = ref(false);
const newName = ref(props.model?.name);
const nameInput = ref(null);

watch(
  () => props.model?.name,
  (name) => {
    if (!renaming.value) {
      newName.value = name;
    }
  }
);

watch(renaming, async (value) => {
  if (value) {
    newName.value = props.model?.name;
    nextTick(() => {
      nameInput.value?.focus();
    });
  } else if (newName.value && newName.value !== props.model.name) {
    try {
      await updateCreatureFolderName.callAsync({
        _id: props.model._id,
        name: newName.value,
      });
    } catch (error) {
      console.error(error);
      snackbar({ text: error.reason });
    }
  }
});

async function removeFolder() {
  try {
    await removeCreatureFolder.callAsync({ _id: props.model._id });
    snackbar({ text: t('characterList.folderDeleted', { name: props.model.name }) });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason });
  }
}
</script>

<style lang="css" scoped>
</style>
