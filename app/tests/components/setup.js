// Every component test's app: the app's own Vuetify (its components, theme
// and defaults) and translations, in English unless a test switches.
import { afterEach } from 'vitest';
import { config } from '@vue/test-utils';
import { createPinia } from 'pinia';
import vuetify from '/imports/ui/plugins/vuetify';
import i18n from '/imports/ui/i18n';

// Pinia too: components read their stores (the dialog stack) as they start
config.global.plugins = [vuetify, i18n, createPinia()];

afterEach(() => {
  i18n.global.locale.value = 'en';
  document.body.innerHTML = '';
});
