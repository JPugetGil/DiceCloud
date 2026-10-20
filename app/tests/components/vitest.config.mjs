// The Vue components' tests (meteor npm run test:components): Vitest renders
// the components in happy-dom, with the app's Vuetify and translations, out
// of Meteor. What a component imports from Meteor resolves to the stubs
// beside this file; a component that needs the server (publications,
// methods) is the browser checks' (tests/e2e), not these tests'.
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../..', import.meta.url));
const stub = name => fileURLToPath(new URL(`./stubs/${name}.js`, import.meta.url));

export default defineConfig({
  root: app,
  plugins: [vue()],
  resolve: {
    alias: [
      // The app's absolute imports (/imports/...), as Rspack resolves them
      { find: /^\/imports\//, replacement: `${app}imports/` },
      { find: /^meteor\/(meteor|tracker|random)$/, replacement: stub('meteor') },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/components/**/*.spec.{js,ts}'],
    setupFiles: ['tests/components/setup.js'],
    // Vuetify imports its styles from its modules: Vite has to process them
    server: { deps: { inline: ['vuetify'] } },
  },
});
