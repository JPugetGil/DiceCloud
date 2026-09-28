<template>
  <div
    class="d-flex flex-1-1 justify-center card-background"
    style="height: 100%;"
  >
    <v-card
      class="ma-4 pa-2"
      style="flex-basis: 900px"
    >
      <v-list>
        <v-list-subheader class="mb-4">
          {{ $t('account.preferences') }}
        </v-list-subheader>
        <v-list-item class="theme-preference">
          <smart-toggle
            :label="$t('account.theme')"
            :value="darkMode === true ? 'true' : darkMode === false ? 'false' : darkMode === null ? 'unset': undefined"
            :options="[
              {name: $t('account.themeDark'), value: 'true', icon: 'mdi-brightness-5'},
              {name: $t('account.themeDevice'), value: 'unset'},
              {name: $t('account.themeLight'), value: 'false', icon: 'mdi-brightness-7'},
            ]"
            @change="setDarkMode"
          />
        </v-list-item>
        <v-list-item data-id="language-preference">
          <smart-toggle
            :label="$t('account.language')"
            :value="locale"
            :options="LANGUAGES"
            @change="setLanguage"
          />
        </v-list-item>
        <v-list-item>
          <smart-switch
            :label="$t('account.swapAbilityScores')"
            :value="
              user &&
                user.preferences &&
                user.preferences.swapAbilityScoresAndModifiers
            "
            @change="swapAbilityScoresAndModifiers"
          />
        </v-list-item>

        <v-list-subheader>
          {{ $t('account.username') }}
        </v-list-subheader>
        <v-list-item data-id="username">
          <template #prepend>
            <v-tooltip location="right">
              <template #activator="{ props }">
                <v-btn
                  variant="text"
                  icon
                  v-bind="props"
                  @click="changeUsername"
                >
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
              </template>
              <span>{{ $t('account.changeUsername') }}</span>
            </v-tooltip>
          </template>
          <v-list-item-title>
            {{ user && user.username }}
          </v-list-item-title>
        </v-list-item>

        <v-list-subheader>
          {{ $t('account.email') }}
        </v-list-subheader>
        <v-list-item
          v-for="email in emails"
          :key="email.address"
        >
          <template
            v-if="emails.length > 1"
            #prepend
          >
            <v-btn
              variant="text"
              icon
              size="small"
              @click="removeEmail(email.address)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>
          <v-list-item-title>
            {{ email.address }}
          </v-list-item-title>
        </v-list-item>
        <v-expand-transition>
          <v-alert
            v-if="removeEmailError"
            type="error"
          >
            {{ removeEmailError }}
          </v-alert>
        </v-expand-transition>
        <v-slide-x-transition
          hide-on-leave
        >
          <v-text-field
            v-if="showEmailInput"
            v-model="inputEmail"
            :label="$t('account.addEmail')"
            :error-messages="addEmailError"
            variant="outlined"
          >
            <template #prepend>
              <v-btn
                variant="text"

                icon
                @click="clearEmailInput"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </template>
            <template #append>
              <v-btn
                variant="text"

                icon
                @click="addEmail"
              >
                <v-icon>mdi-send</v-icon>
              </v-btn>
            </template>
          </v-text-field>
          <v-btn
            v-else-if="!emails || emails.length < 2"
            variant="text"
            icon
            @click="showEmailInput = true"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>
        </v-slide-x-transition>
        <v-list-item v-if="googleConfigured && user && !user.services?.google">
          <v-btn
            color="primary"
            @click="linkWithGoogle"
          >
            {{ $t('account.linkGoogle') }}
          </v-btn>
        </v-list-item>
      </v-list>
      <div class="d-flex flex-1-1 justify-end">
        <v-btn
          color="accent"
          @click="signOut"
        >
          {{ $t('account.signOut') }}
        </v-btn>
      </div>
      <div class="d-flex flex-1-1 justify-end mt-3">
        <v-btn
          color="error"
          data-id="delete-account-btn"
          @click="deleteAccount"
        >
          {{ $t('account.deleteAccount') }}
        </v-btn>
      </div>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import router from '/imports/client/ui/router';
import addEmailMethod from '/imports/api/users/methods/addEmail';
import removeEmailMethod from '/imports/api/users/methods/removeEmail';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import useLoginServiceConfigured from '/imports/client/ui/utility/useLoginServiceConfigured';
import { useI18n } from 'vue-i18n';
import { LANGUAGES, setLocale } from '/imports/client/ui/i18n';

const dialogStackStore = useDialogStackStore();
const { locale } = useI18n();


const user = autorun(() => Meteor.user()).result;
const emails = autorun(() => {
  const u = Meteor.user();
  return u && u.emails;
}).result;
const darkMode = autorun(() => {
  return user.value && user.value.darkMode;
}).result;

const signOutBusy = ref(false);
const linkGoogleError = ref('');
const googleConfigured = useLoginServiceConfigured('google');

// Add email
const showEmailInput = ref(false);
const addEmailLoading = ref(false);
const inputEmail = ref('');
const addEmailError = ref(undefined);

// Remove email
const removeEmailLoading = ref(undefined);
const removeEmailError = ref(undefined);

function changeUsername() {
  dialogStackStore.pushDialogStack({
    component: 'username-dialog',
    elementId: 'username',
  });
}

function clearEmailInput() {
  showEmailInput.value = false;
  addEmailError.value = undefined;
  inputEmail.value = '';
}

async function addEmail() {
  addEmailLoading.value = true;
  try {
    await addEmailMethod.callAsync({ email: inputEmail.value });
    addEmailError.value = undefined;
    showEmailInput.value = false;
    inputEmail.value = '';
  } catch (error) {
    addEmailError.value = error.message;
  } finally {
    addEmailLoading.value = false;
  }
}

async function removeEmail(address) {
  removeEmailLoading.value = address;
  try {
    await removeEmailMethod.callAsync({ email: address });
    removeEmailError.value = undefined;
    showEmailInput.value = false;
    inputEmail.value = '';
  } catch (error) {
    removeEmailError.value = error.message;
  } finally {
    removeEmailLoading.value = undefined;
  }
}

async function signOut() {
  signOutBusy.value = true;
  try {
    await Meteor.logoutAsync();
    await router.push('/');
  } finally {
    signOutBusy.value = false;
  }
}

async function setLanguage(value, ack) {
  setLocale(value);
  try {
    await Meteor.users.setLanguage.callAsync({ language: value });
    ack();
  } catch (error) {
    ack(error);
  }
}

async function setDarkMode(value, ack) {
  let dm;
  if (value === 'true') {
    dm = true;
  } else if (value === 'false') {
    dm = false;
  } else if (value === 'unset') {
    dm = null;
  }
  try {
    await Meteor.users.setDarkMode.callAsync({ darkMode: dm });
    ack();
  } catch (error) {
    ack(error);
  }
}

async function swapAbilityScoresAndModifiers(value, ack) {
  try {
    await Meteor.users.setPreference.callAsync({
      preference: 'swapAbilityScoresAndModifiers',
      value: !!value,
    });
    ack();
  } catch (error) {
    ack(error);
  }
}



function linkWithGoogle() {
  linkGoogleError.value = '';
  Meteor.linkWithGoogle(error => {
    if (error) linkGoogleError.value = error;
  });
}

function deleteAccount() {
  dialogStackStore.pushDialogStack({
    component: 'delete-user-account-dialog',
    elementId: 'delete-account-btn',
  });
}
</script>

<style scoped>
/*
 * The toggle's legend straddles the top border of its fieldset. Vuetify 3's list
 * item clips its content (Vuetify 2's did not), which cut the legend in half.
 */
.theme-preference :deep(.v-list-item__content) {
  overflow: visible;
}
</style>
