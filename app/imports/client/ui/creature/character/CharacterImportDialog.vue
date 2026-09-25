<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('importCharacter.title') }}
      </v-toolbar-title>
    </template>
    <div>
      <h2 class="mb-4">
        {{ $t('importCharacter.text') }}
      </h2>
      <p>
        {{ $t('importCharacter.sharingHint') }}
      </p>
      <text-field
        :value="currentUrl"
        :error-messages="importError"
        @change="setUrl"
      />
      <div class="d-flex justify-center">
        <v-slide-x-transition>
          <v-btn
            v-show="characterData"
            :loading="loadingImportCharacter"
            color="primary"
            @click="importCharacterData"
          >
            {{ $t('common.import') }}
          </v-btn>
        </v-slide-x-transition>
      </div>
    </div>
    <template #actions>
      <v-btn
        variant="text"
        @click="$emit('pop')"
      >
        {{ $t('common.cancel') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref} from 'vue';
import { subscribe } from 'vue-meteor-tracker';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import importCharacterFromDiceCloudInstance from '/imports/api/creature/creatures/methods/importCharacterFromDiceCloudInstance';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits(['pop']);

const loadingImportCharacter = ref(false);
const importError = ref(undefined);
const currentUrl = ref('');
const characterData = ref(undefined);


subscribe('libraries');

async function setUrl(val, ack) {
  const regex = /(https?:\/\/)([\w|.]+)\/character\/([^/]+)\/(.+)/;
  if (!regex.test(val)) {
    ack(t('importCharacter.invalidUrl'));
    return;
  }
  const newUrl = val.replace(regex, '$1$2/api/creature/$3');
  let fetchedCharacterData = undefined;
  importError.value = undefined;
  try {
    const res = await fetch(newUrl);
    fetchedCharacterData = await res.json();
  } catch (e) {
    ack(e);
    return;
  }
  if (fetchedCharacterData.error) {
    if (fetchedCharacterData.reason === 'No user ID. Are you logged in?') {
      ack(t('importCharacter.notShared'));
    } else {
      ack(fetchedCharacterData.reason ?? fetchedCharacterData.error);
    }
    return;
  }
  characterData.value = fetchedCharacterData;
  currentUrl.value = val;
  ack();
}

async function importCharacterData() {
  loadingImportCharacter.value = true;
  try {
    const characterId = await importCharacterFromDiceCloudInstance.callAsync({
      characterData: characterData.value
    });
    emit('pop', characterId);
  } catch (error) {
    importError.value = error.reason || error.message || error.toString();
  } finally {
    loadingImportCharacter.value = false;
  }
}
</script>

<style scoped>

</style>
