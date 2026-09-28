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
          v-model="name"
          type="text"
          :label="$t('auth.usernameOrEmail')"
          :rules="nameRules"
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
        <v-btn
          variant="text"
          to="/reset-password"
        >
          {{ $t('auth.resetPassword') }}
        </v-btn>
        <div
          v-if="error"
          class="text-error"
        >
          {{ error }}
        </div>
        <div class="d-flex flex-1-1">
          <v-btn
            :disabled="!valid"
            color="accent"
            class="ma-2"
            @click="submit"
          >
            {{ $t('auth.signIn') }}
          </v-btn>
          <v-btn
            color="accent"
            :to="{ name: 'register', query: { redirect: $route.query.redirect} }"
            class="ma-2"
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
          class="ma-2"
          @click="googleLogin"
        >
          {{ $t('auth.signInWithGoogle') }}
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
  // Vuetify 3's validate() resolves to { valid, errors }; the Promise itself is
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
