<template>
  <div :style="dense ? undefined : 'min-height: 60px;'">
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
        regular
        hide-details
        dense
        :value="newName"
        @change="renameFolder"
        @click.stop=""
        @input.stop=""
        @keydown.stop=""
        @keyup.stop=""
      />
      <template v-if="!selection && !dense">
        <v-spacer />
        <v-btn
          v-if="renaming || open"
          variant="text"
          icon
          style="flex-grow: 0"
          @click.stop="renaming = !renaming"
        >
          <v-icon v-if="renaming">
            mdi-check
          </v-icon>
          <v-icon v-else>
            mdi-pencil
          </v-icon>
        </v-btn>
        <v-btn
          v-if="open"
          variant="text"
          icon
          style="flex-grow: 0"
          @click.stop="removeFolder"
        >
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </template>
    </v-list-item-title>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import updateCreatureFolderName from '/imports/api/creature/creatureFolders/methods.js/updateCreatureFolderName';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods.js/removeCreatureFolder';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  open: Boolean,
  selection: Boolean,
  dense: Boolean,
});

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

function renameFolder(name, ack) {
  newName.value = name;
  ack();
}

async function removeFolder() {
  try {
    await removeCreatureFolder.callAsync({ _id: props.model._id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason });
  }
}
</script>

<style lang="css" scoped>
</style>
