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
  defaults: {
    // Toolbars without a colour of their own use the `toolbar` grey (see themes.js)
    VToolbar: {
      color: 'toolbar',
    },
    // An avatar is transparent unless given a colour: `flat` (Vuetify's default)
    // fills it with the surface colour, a circle that shows on hovered or
    // selected list items and in the drawer. Coloured avatars set `flat`
    VAvatar: {
      variant: 'text',
    },
    // Material marks a focused field and a selected control with the primary
    // colour. Vuetify leaves them grey unless given a colour (Vuetify 2 used
    // primary), so focus and checked states barely showed
    VTextField: { color: 'primary' },
    VTextarea: { color: 'primary' },
    VSelect: { color: 'primary' },
    VCombobox: { color: 'primary' },
    VAutocomplete: { color: 'primary' },
    VFileInput: { color: 'primary' },
    VCheckbox: { color: 'primary' },
    VCheckboxBtn: { color: 'primary' },
    VRadio: { color: 'primary' },
    VSwitch: { color: 'primary' },
    VSlider: { color: 'primary' },
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
