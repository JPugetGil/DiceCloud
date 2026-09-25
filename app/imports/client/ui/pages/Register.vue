<template>
  <div>
    <v-form
      ref="form"
      class="mt-4"
    >
      <div class="d-flex flex-1-1 flex-column align-center">
        <v-img
          cover
          src="crown-dice-logo-cropped-transparent.png"
          width="120px"
          class="ma-3"
        />
        <v-text-field
          v-model="email"
          type="text"
          :label="$t('auth.email')"
          :rules="emailRules"
          class="ma-2 w-100"
          style="max-width: 320px;"
          variant="outlined"
          required
          @keyup.enter="submit"
        />
        <v-text-field
          v-model="username"
          type="text"
          :label="$t('auth.username')"
          :rules="usernameRules"
          class="ma-2 w-100"
          style="max-width: 320px;"
          variant="outlined"
          required
          @keyup.enter="submit"
        />
        <v-text-field
          v-model="password"
          type="password"
          :label="$t('auth.password')"
          :rules="passwordRules"
          class="ma-2 w-100"
          style="max-width: 320px;"
          variant="outlined"
          required
          @keyup.enter="submit"
        />
        <v-text-field
          v-model="password2"
          type="password"
          :label="$t('auth.passwordAgain')"
          :rules="password2Rules"
          class="ma-2 w-100"
          style="max-width: 320px;"
          variant="outlined"
          required
          @keyup.enter="submit"
        />
        <div class="text-error">
          {{ error }}
        </div>
        <div class="d-flex flex-1-1">
          <v-btn
            :disabled="!valid"
            color="accent"
            @click="submit"
          >
            {{ $t('auth.register') }}
          </v-btn>
        </div>
      </div>
    </v-form>
    <!-- Only once Google sign-in is configured on the server (see README) -->
    <template v-if="googleConfigured">
      <v-divider class="ma-4" />
      <div class="d-flex flex-1-1 flex-column align-center">
        <div class="text-error">
          {{ googleError }}
        </div>
        <v-btn
          color="accent"
          @click="googleLogin"
        >
          {{ $t('auth.registerWithGoogle') }}
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import useLoginServiceConfigured from '/imports/client/ui/utility/useLoginServiceConfigured';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const form = ref(null);
const valid = ref(true);
const username = ref('');
const usernameRules = [
  v => !!v || t('auth.nameRequired'),
];
const email = ref('');
const emailRules = [
  v => !!v || t('auth.emailRequired'),
  v => /.+@.+/.test(v) || t('auth.emailInvalid'),
];
const password = ref('');
const passwordRules = [
  v => !!v || t('auth.passwordRequired'),
];
const password2 = ref('');
const password2Rules = [
  v => !!v || t('auth.passwordRequired'),
  v => v == password.value || t('auth.passwordsDontMatch'),
];
const error = ref('');
const googleError = ref('');
const googleConfigured = useLoginServiceConfigured('google');

async function submit() {
  // Vuetify 3's validate() resolves to { valid, errors }; the Promise itself is
  // always truthy, so testing it directly let invalid forms through
  const { valid: formValid } = await form.value.validate();
  if (!formValid) return;
  Accounts.createUser({
    username: username.value,
    password: password.value,
    email: email.value,
  }, createError => {
    if (createError) {
      error.value = createError.reason;
    } else {
      router.push(route.query.redirect || '/character-list');
    }
  });
}

function googleLogin() {
  Meteor.loginWithGoogle(loginError => {
    if (loginError) googleError.value = loginError.reason;
  });
}
</script>
