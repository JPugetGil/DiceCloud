<template>
  <dialog-base>
    <text-field
      :label="$t('auth.username')"
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
        {{ $t('common.update') }}
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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
      ack(t('account.usernameTaken'));
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
