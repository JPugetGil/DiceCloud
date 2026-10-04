<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('party.myCharacters') }}
      </v-toolbar-title>
    </template>
    <p class="text-body-medium text-medium-emphasis mt-0">
      {{ $t('party.myCharactersHint') }}
    </p>
    <party-character-picker v-model="selectedIds" />
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        :loading="saving"
        data-id="party-characters-save"
        @click="save"
      >
        {{ $t('common.save') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref } from 'vue';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import PartyCharacterPicker from '/imports/ui/creature/party/PartyCharacterPicker.vue';
import { setMyPartyCharacters } from '/imports/api/creature/creatureFolders/methods/partyMethods';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/** A player chooses which of their characters they bring to a party */
const props = defineProps({
  folderId: {
    type: String,
    required: true,
  },
  creatureIds: {
    type: Array,
    default: () => [],
  },
});

const dialogStackStore = useDialogStackStore();
const selectedIds = ref([...props.creatureIds]);
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await setMyPartyCharacters.callAsync({ folderId: props.folderId, creatureIds: selectedIds.value });
    await dialogStackStore.popDialogStack();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    saving.value = false;
  }
}
</script>
