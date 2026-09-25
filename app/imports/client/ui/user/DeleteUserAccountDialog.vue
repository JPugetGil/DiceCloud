<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('deleteAccount.title') }}
      </v-toolbar-title>
    </template>
    <div>
      <h2>{{ $t('deleteAccount.areYouSure') }}</h2>
      <v-alert
        :value="true"
        icon="mdi-alert"
        color="error"
        variant="outlined"
      >
        {{ $t('deleteAccount.cantRecover') }}
      </v-alert>
      <p>{{ $t('deleteAccount.immediately') }}</p>
      <p>{{ $t('deleteAccount.usernameAvailable') }}</p>
      <template v-if="characters?.length">
        <h3 v-if="characters.length > 1">
          {{ $t('deleteAccount.charactersDeleted', { count: characters.length }) }}
        </h3>
        <h3 v-else>
          {{ $t('deleteAccount.characterDeleted') }}
        </h3>
        <v-list>
          <creature-list-tile
            v-for="character in characters"
            :key="character._id"
            :model="character"
          />
        </v-list>
      </template>
      <template v-if="libraries?.length">
        <h3 v-if="libraries.length > 1">
          {{ $t('deleteAccount.librariesDeleted', { count: libraries.length }) }}
        </h3>
        <h3 v-else>
          {{ $t('deleteAccount.libraryDeleted') }}
        </h3>
        <v-list>
          <creature-list-tile
            v-for="library in libraries"
            :key="library._id"
            :model="library"
          />
        </v-list>
      </template>
      <div class="d-flex flex-1-1 flex-column align-start">
        <v-text-field
          v-if="user?.username"
          v-model="usernameInput"
          :label="$t('deleteAccount.typeUsername')"
          style="width: 350px;"
          :error-messages="usernameInputValid ? undefined : ' '"
          :append-icon="usernameInputValid ? 'mdi-check' : undefined"
        />
        <v-text-field
          v-model="verificationInput"
          :label="$t('deleteAccount.typePhrase', { phrase: $t('deleteAccount.phrase') })"
          style="width: 350px;"
          :error-messages="verificationInputValid ? undefined : ' '"
          :append-icon="verificationInputValid ? 'mdi-check' : undefined"
        />
        <v-btn
          class="mt-4"
          color="error"
          :disabled="!valid"
          @click="deleteAccount"
        >
          {{ $t('deleteAccount.permanently') }}
        </v-btn>
      </div>
    </div>
    <template #actions>
      <div

        class="d-flex flex-1-1 justify-end"
      >
        <v-btn
          variant="text"
          @click="dialogStackStore.popDialogStack()"
        >
          {{ $t('common.cancel') }}
        </v-btn>
      </div>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';
import Libraries from '/imports/api/library/Libraries';
import CreatureListTile from '/imports/client/ui/creature/creatureList/CreatureListTile.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const router = useRouter();

const usernameInput = ref('');
const verificationInput = ref('');

subscribe('ownedDocuments');

const characters = autorun(() => Creatures.find({ owner: Meteor.userId() })).result;
const libraries = autorun(() => Libraries.find({ owner: Meteor.userId() })).result;
const user = autorun(() => Meteor.user()).result;

const usernameInputValid = computed(() => {
  let username = user.value?.username;
  if (!username) return true;
  let input = usernameInput.value;
  if (!input) return false;
  if (input.toLowerCase() === username.toLowerCase()) {
    return true;
  } else {
    return false;
  }
});

const verificationInputValid = computed(() => {
  let input = verificationInput.value || '';
  return input.toLowerCase() === t('deleteAccount.phrase');
});

const valid = computed(() => {
  return usernameInputValid.value && verificationInputValid.value;
});

async function deleteAccount() {
  await Meteor.users.deleteMyAccount.callAsync();
  await router.push('/');
  await dialogStackStore.popDialogStack();
}
</script>

<style lang="css" scoped>

</style>
