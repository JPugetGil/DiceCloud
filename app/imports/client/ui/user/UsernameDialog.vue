<template>
  <dialog-base>
    <text-field
      label="Username"
      :value="newUsername || username"
      @change="change"
    />
    <div
      v-if="error"
      class="bg-error"
    >
      {{ error }}
    </div>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        :disabled="!valid"
        :loading="loading"
        @click="setUsername"
      >
        Update
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const valid = ref(true);

const newUsername = ref(null);


const error = ref(null);

const loading = ref(false);

const dialogStackStore = useDialogStackStore();

// The current username, which the field starts from
const username = autorun(() => Meteor.user()?.username).result;

async function change(username, ack) {
  loading.value = true;
  try {
    const result = await Meteor.users.canPickUsername.callAsync({username});
    if (result){
      valid.value = false;
      ack('Username is already taken');
    } else {
      valid.value = true;
      newUsername.value = username;
      ack();
    }
  } catch (error) {
    valid.value = false;
    ack(error.message || error);
  } finally {
    loading.value = false;
  }
}

async function setUsername() {
  loading.value = true;
  try {
    await Meteor.users.setUsername.callAsync({username: newUsername.value});
    await dialogStackStore.popDialogStack();
  } catch (e) {
    error.value = e.message || e;
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="css" scoped>
</style>
