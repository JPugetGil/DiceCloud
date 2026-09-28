const { defineConfig } = require('@meteorjs/rspack');
const { VueLoaderPlugin } = require('vue-loader');
const { DefinePlugin } = require('@rspack/core');
const path = require('node:path');

// Resolved through package.json, which the package does export, because the
// build file itself is not reachable as a subpath.
const ngraphEventsCjs = path.join(
  path.dirname(require.resolve('ngraph.events/package.json')),
  'dist/ngraph.events.cjs'
);

/**
 * Rspack bundles the app's own client and server code; Meteor's bundler still
 * produces the final output and keeps Atmosphere packages working.
 *
 * Only the client side needs configuration here: it is the side that compiles
 * single-file components and stylesheets.
 */
module.exports = defineConfig(Meteor => {
  return {
    resolve: {
      alias: {
        'ngraph.events$': ngraphEventsCjs,
      },
    },
    ...Meteor.isClient && {
      devServer: {
        client: {
          webSocketURL: 'auto://0.0.0.0:0/ws',
        },
      },
      plugins: [
        new VueLoaderPlugin(),
        new DefinePlugin({
          __VUE_OPTIONS_API__: 'true',
          __VUE_PROD_DEVTOOLS__: JSON.stringify(Meteor.isDevelopment),
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
          // vue-i18n's esm-bundler build: Composition API only
          __VUE_I18N_FULL_INSTALL__: 'true',
          __VUE_I18N_LEGACY_API__: 'false',
          __INTLIFY_PROD_DEVTOOLS__: 'false',
          __INTLIFY_JIT_COMPILATION__: 'true',
          __INTLIFY_DROP_MESSAGE_COMPILER__: 'false',
        }),
      ],
      module: {
        rules: [
          {
            test: /\.vue$/,
            loader: 'vue-loader',
            options: {
              // Required for most vue-loader features under Rspack
              experimentalInlineMatchResource: true,
              compilerOptions: {
                comments: false,
              },
            },
          },
          {
            test: /\.css$/,
            type: 'css',
          },
        ],
      },
    },
  };
});
