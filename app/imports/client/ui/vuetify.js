import { h } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import 'vuetify/styles';
import SVG_ICONS from '/imports/constants/SVG_ICONS';
import SvgIconByName from '/imports/client/ui/icons/SvgIconByName.vue';
import themes from '/imports/client/ui/themes';

const customIcons = {};

for (const name in SVG_ICONS) {
  const icon = SVG_ICONS[name];
  customIcons[icon.name] = props => h(SvgIconByName, { ...props, name });
}

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes,
  },
  // Toolbars without a colour of their own, as in Vuetify 2 (see themes.js)
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
