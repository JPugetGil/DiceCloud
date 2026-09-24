<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        Delete User Account
      </v-toolbar-title>
    </template>
    <div>
      <h2>Are you sure you want to delete your account?</h2>
      <v-alert
        :value="true"
        icon="mdi-alert"
        color="error"
        variant="outlined"
      >
        Deleted accounts can not be recovered
      </v-alert>
      <p>We will immediately delete your account and all of your data</p>
      <p>Your username will become available to anyone on DiceCloud</p>
      <template v-if="characters?.length">
        <h3 v-if="characters.length > 1">
          These {{ characters.length }} characters will be deleted:
        </h3>
        <h3 v-else>
          This character will be deleted:
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
          These {{ libraries.length }} libraries will be deleted:
        </h3>
        <h3 v-else>
          This library will be deleted:
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
          label="Type your username or email"
          style="width: 350px;"
          :error-messages="usernameInputValid ? undefined : ' '"
          :append-icon="usernameInputValid ? 'mdi-check' : undefined"
        />
        <v-text-field
          v-model="verificationInput"
          label="To verify type 'delete my account'"
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
          Permanently delete account
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
          Cancel
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
  return input.toLowerCase() === 'delete my account';
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
