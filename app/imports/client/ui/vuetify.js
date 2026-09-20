import Vue from 'vue';
// vuetify/lib is the untranspiled build: every component in it imports its own
// .sass, which needs a Sass compiler in the build chain. Meteor has none, so
// those imports resolve to nothing at runtime. The dist build ships the same
// components already compiled, with their stylesheet alongside.
import Vuetify from 'vuetify';
import 'vuetify/dist/vuetify.min.css';
import SVG_ICONS from '/imports/constants/SVG_ICONS';
import SvgIconByName from '/imports/client/ui/icons/SvgIconByName.vue';
import themes from '/imports/client/ui/themes';
import minifyTheme from 'minify-css-string';

// The dist build registers every component and directive itself.
Vue.use(Vuetify);

let icons = {};

for (const name in SVG_ICONS) {
  let icon = SVG_ICONS[name];
  icons[icon.name] = {
    component: SvgIconByName,
    props: {
      name: name,
    }
  }
}

let vuetify = new Vuetify({
  theme: {
    themes,
    options: {
      variations: false,
      minifyTheme,
    },
    //options: { customProperties: true },
  },
  icons: {
    iconfont: 'mdi',
    values: icons,
  }
});

export default vuetify;
