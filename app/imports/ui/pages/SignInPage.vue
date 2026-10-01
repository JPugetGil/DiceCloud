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
          {{ $t('auth.signIn') }}
        </v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form
          ref="form"
          class="d-flex flex-column ga-2"
        >
          <v-text-field
            v-model="name"
            type="text"
            autocomplete="username"
            :label="$t('auth.usernameOrEmail')"
            :rules="nameRules"
            prepend-inner-icon="mdi-account-outline"
            variant="outlined"
            required
            @keyup.enter="submit"
          />
          <v-text-field
            v-model="password"
            type="password"
            autocomplete="current-password"
            :label="$t('auth.password')"
            :rules="passwordRules"
            prepend-inner-icon="mdi-lock-outline"
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
            {{ $t('auth.signIn') }}
          </v-btn>
          <div class="d-flex flex-wrap justify-space-between align-center">
            <v-btn
              variant="text"
              size="small"
              to="/reset-password"
            >
              {{ $t('auth.resetPassword') }}
            </v-btn>
            <v-btn
              variant="text"
              size="small"
              color="primary"
              :to="{ name: 'register', query: { redirect: $route.query.redirect} }"
            >
              {{ $t('auth.createAccount') }}
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
            {{ $t('auth.signInWithGoogle') }}
          </v-btn>
        </v-card-text>
      </template>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import useLoginServiceConfigured from '/imports/ui/composables/useLoginServiceConfigured';
import { Meteor } from 'meteor/meteor';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const form = ref(null);
const valid = ref(true);
const name = ref('');
const nameRules = [
  v => !!v || t('auth.nameRequired'),
];
const password = ref('');
const passwordRules = [
  v => !!v || t('auth.passwordRequired'),
];
const error = ref('');
const googleError = ref('');
const googleConfigured = useLoginServiceConfigured('google');

async function submit() {
  // Vuetify's validate() resolves to { valid, errors }; the Promise itself is
  // always truthy, so testing it directly let invalid forms through
  const { valid: formValid } = await form.value.validate();
  if (!formValid) return;
  Meteor.loginWithPassword(name.value, password.value, loginError => {
    if (loginError) {
      error.value = loginError.reason;
    } else {
      router.push(route.query.redirect || '/character-list');
    }
  });
}

function googleLogin() {
  Meteor.loginWithGoogle(loginError => {
    if (loginError) {
      console.error(loginError);
      googleError.value = loginError.message;
    } else {
      router.push(route.query.redirect || '/character-list');
    }
  });
}
</script>

<style scoped>
.auth-card {
  max-width: 420px;
}
</style>
