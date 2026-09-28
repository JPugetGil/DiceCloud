import { h } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { useI18n } from 'vue-i18n';
import i18n from '/imports/ui/i18n';
import 'vuetify/styles';
import SVG_ICONS from '/imports/constants/SVG_ICONS';
import SvgIconByName from '/imports/ui/icons/SvgIconByName.vue';
import themes from '/imports/ui/plugins/themes';

const customIcons = {};

for (const name in SVG_ICONS) {
  const icon = SVG_ICONS[name];
  customIcons[icon.name] = props => h(SvgIconByName, { ...props, name });
}

const vuetify = createVuetify({
  components,
  directives,
  // Built-in texts follow the app's language
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
  theme: {
    defaultTheme: 'light',
    themes,
  },
  // Toolbars without a colour of their own use the `toolbar` grey (see themes.js)
  defaults: {
    VToolbar: {
      color: 'toolbar',
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases: {
      ...aliases,
      ...customIcons,
    },
    sets: {
      mdi,
    },
  },
});

export default vuetify;
