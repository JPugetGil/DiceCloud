import { createApp } from 'vue';
import { createPinia } from 'pinia';
import AppLayout from '/imports/client/ui/layouts/AppLayout.vue';
import router from '/imports/client/ui/router';
import registerGlobalComponents from '/imports/client/ui/components/global/globalIndex';
import '/imports/client/ui/markdownCofig';
import vuetify from '/imports/client/ui/vuetify';

// App start
Meteor.startup(() => {
  const app = createApp(AppLayout);

  app.config.devtools = true;
  // Pinia first: components resolve their stores during setup, and a store
  // cannot be used before its app installs Pinia
  app.use(createPinia());
  app.use(router);
  app.use(vuetify);
  registerGlobalComponents(app);
  app.mount('#app');
});
