<template>
  <dialog-base>
    <text-field
      :label="$t('auth.username')"
      :model-value="newUsername || username"
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
import errorText from '/imports/api/utility/errorText';
import { canPickUsername, setUsername as setUsernameMethod } from '/imports/api/users/Users';
import { ref } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const valid = ref(true);

const newUsername = ref(/** @type {string | null} */ (null));


const error = ref(/** @type {string | null} */ (null));

const loading = ref(false);

const dialogStackStore = useDialogStackStore();

// The current username, which the field starts from
const username = autorun(() => Meteor.user()?.username).result;

async function change(username, ack) {
  loading.value = true;
  try {
    const result = await canPickUsername.callAsync({username});
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
    ack(errorText(error));
  } finally {
    loading.value = false;
  }
}

async function setUsername() {
  loading.value = true;
  try {
    await setUsernameMethod.callAsync({username: newUsername.value});
    await dialogStackStore.popDialogStack();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
</script>
