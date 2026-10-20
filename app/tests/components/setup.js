// Every component test's app: the app's own Vuetify (its components, theme
// and defaults) and translations, in English unless a test switches.
import { afterEach } from 'vitest';
import { config } from '@vue/test-utils';
import vuetify from '/imports/ui/plugins/vuetify';
import i18n from '/imports/ui/i18n';

config.global.plugins = [vuetify, i18n];

afterEach(() => {
  i18n.global.locale.value = 'en';
  document.body.innerHTML = '';
});
