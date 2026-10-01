<template>
  <div class="d-flex justify-center pa-4">
    <v-card
      class="auth-card w-100 pa-2"
      elevation="2"
    >
      <v-card-item class="text-center">
        <v-img
          src="/crown-dice-logo-cropped-transparent.png"
          alt=""
          width="72"
          height="72"
          class="mx-auto mb-2"
        />
        <v-card-title class="text-headline-small">
          {{ $t('auth.register') }}
        </v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form
          ref="form"
          class="d-flex flex-column ga-2"
        >
          <v-text-field
            v-model="email"
            type="email"
            autocomplete="email"
            :label="$t('auth.email')"
            :rules="emailRules"
            prepend-inner-icon="mdi-email-outline"
            variant="outlined"
            required
            @keyup.enter="submit"
          />
          <v-text-field
            v-model="username"
            type="text"
            autocomplete="username"
            :label="$t('auth.username')"
            :rules="usernameRules"
            prepend-inner-icon="mdi-account-outline"
            variant="outlined"
            required
            @keyup.enter="submit"
          />
          <v-text-field
            v-model="password"
            type="password"
            autocomplete="new-password"
            :label="$t('auth.password')"
            :rules="passwordRules"
            prepend-inner-icon="mdi-lock-outline"
            variant="outlined"
            required
            @keyup.enter="submit"
          />
          <v-text-field
            v-model="password2"
            type="password"
            autocomplete="new-password"
            :label="$t('auth.passwordAgain')"
            :rules="password2Rules"
            prepend-inner-icon="mdi-lock-check-outline"
            variant="outlined"
            required
            @keyup.enter="submit"
          />
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            :text="error"
          />
          <v-btn
            :disabled="!valid"
            color="primary"
            variant="flat"
            size="large"
            block
            @click="submit"
          >
            {{ $t('auth.register') }}
          </v-btn>
          <div class="d-flex justify-end">
            <v-btn
              variant="text"
              size="small"
              color="primary"
              :to="{ name: 'signIn', query: { redirect: $route.query.redirect} }"
            >
              {{ $t('auth.haveAccount') }}
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
      <!-- Only once Google sign-in is configured on the server (see README) -->
      <template v-if="googleConfigured">
        <v-divider class="mx-4" />
        <v-card-text class="d-flex flex-column ga-2">
          <v-alert
            v-if="googleError"
            type="error"
            variant="tonal"
            density="compact"
            :text="googleError"
          />
          <v-btn
            variant="outlined"
            prepend-icon="mdi-google"
            block
            @click="googleLogin"
          >
            {{ $t('auth.registerWithGoogle') }}
          </v-btn>
        </v-card-text>
      </template>
      <!-- Applies to both ways of registering -->
      <i18n-t
        keypath="auth.acceptTerms"
        scope="global"
        tag="p"
        class="text-body-small text-medium-emphasis text-center mx-4 mb-4 mt-0"
        data-id="accept-terms"
      >
        <template #terms>
          <router-link to="/terms">
            {{ $t('legal.termsLink') }}
          </router-link>
        </template>
        <template #privacy>
          <router-link to="/privacy">
            {{ $t('legal.privacyLink') }}
          </router-link>
        </template>
      </i18n-t>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import useLoginServiceConfigured from '/imports/ui/composables/useLoginServiceConfigured';
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
  // Vuetify's validate() resolves to { valid, errors }; the Promise itself is
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

<style scoped>
.auth-card {
  max-width: 420px;
}
</style>
