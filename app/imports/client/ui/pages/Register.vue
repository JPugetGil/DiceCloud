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
          label="Email"
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
          label="Username"
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
          label="Password"
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
          label="Password Again"
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
            Register
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
          Register with Google
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

const route = useRoute();
const router = useRouter();

const form = ref(null);
const valid = ref(true);
const username = ref('');
const usernameRules = [
  v => !!v || 'Name is required',
];
const email = ref('');
const emailRules = [
  v => !!v || 'E-mail is required',
  v => /.+@.+/.test(v) || 'E-mail must be valid',
];
const password = ref('');
const passwordRules = [
  v => !!v || 'Password is required',
];
const password2 = ref('');
const password2Rules = [
  v => !!v || 'Password is required',
  v => v == password.value || 'Passwords don\'t match',
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
