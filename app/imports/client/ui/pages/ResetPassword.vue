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

        <template v-if="token">
          <v-text-field
            v-model="password"
            type="password"
            :label="$t('auth.newPassword')"
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
        </template>
        <v-text-field
          v-else
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
        <v-expand-transition>
          <v-alert
            v-if="error"
            type="error"
          >
            {{ error }}
          </v-alert>
        </v-expand-transition>
        <v-expand-transition>
          <v-alert
            v-if="info"
            type="info"
          >
            {{ info }}
          </v-alert>
        </v-expand-transition>
        <div class="d-flex flex-1-1">
          <v-btn
            :disabled="!valid"
            color="accent"
            @click="submit"
          >
            {{ $t('auth.resetPassword') }}
          </v-btn>
        </div>
      </div>
    </v-form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Accounts } from 'meteor/accounts-base';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();

const form = ref(null);
const valid = ref(true);
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
const info = ref('');

const token = computed(() => route.params.token);

async function submit() {
  // Vuetify 3's validate() resolves to { valid, errors }; the Promise itself is
  // always truthy, so testing it directly let invalid forms through
  const { valid: formValid } = await form.value.validate();
  if (!formValid) return;
  if (token.value) {
    Accounts.resetPassword(token.value, password.value, resetError => {
      error.value = resetError && resetError.message;
      info.value = '';
      if (!resetError) {
        router.push('/character-list');
      }
    });
  } else {
    Accounts.forgotPassword({ email: email.value }, forgotError => {
      error.value = forgotError && forgotError.message;
      info.value = '';
      if (!forgotError) {
        info.value = t('auth.resetLinkSent', { email: email.value });
        email.value = '';
        valid.value = true;
      }
    });
  }
}
</script>
