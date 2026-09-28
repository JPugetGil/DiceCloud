import { Meteor } from 'meteor/meteor';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '/imports/ui/App.vue';
import router from '/imports/ui/router';
import registerGlobalComponents from '/imports/ui/components/global/globalIndex';
import vuetify from '/imports/ui/plugins/vuetify';
import i18n from '/imports/ui/i18n';
// After Vuetify's styles, which the app's stylesheets override
import '/imports/ui/stylesheets';

Meteor.startup(() => {
  const app = createApp(App);

  // Pinia first: components resolve their stores during setup, and a store
  // cannot be used before its app installs Pinia
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  app.use(vuetify);
  registerGlobalComponents(app);
  app.mount('#app');
});
