import { h } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from '/imports/ui/plugins/vuetifyComponents';
import { Ripple } from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { useI18n } from 'vue-i18n';
import i18n from '/imports/ui/i18n';
import 'vuetify/styles';
// VApp renders with the v-layout classes, whose styles only VLayout imports
import 'vuetify/lib/components/VLayout/VLayout.css';
import SVG_ICONS from '/imports/constants/SVG_ICONS';
import SvgIconByName from '/imports/ui/icons/SvgIconByName.vue';
import themes from '/imports/ui/plugins/themes';

// Discord's logo (`$discord`), which Material Design Icons dropped with its
// other brands in version 7: the path of Simple Icons (CC0), on 24 by 24 as
// MDI's, drawn by Vuetify's own svg set
const DISCORD_LOGO = 'svg:M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';

const customIcons = { discord: DISCORD_LOGO };

for (const name in SVG_ICONS) {
  const icon = SVG_ICONS[name];
  customIcons[icon.name] = props => h(SvgIconByName, { ...props, name });
}

const vuetify = createVuetify({
  components,
  // The only directive templates use; components import their own
  directives: { Ripple },
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
    // Material 3 rounds cards more than Vuetify's 4px: 8px (rounded-lg)
    VCard: {
      rounded: 'lg',
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
    VFileInput: { color: 'primary' },
    VCheckbox: { color: 'primary' },
    VCheckboxBtn: { color: 'primary' },
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
