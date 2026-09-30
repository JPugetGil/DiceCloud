const { defineConfig } = require('@meteorjs/rspack');
const { VueLoaderPlugin } = require('vue-loader');
const {
  DefinePlugin,
  LightningCssMinimizerRspackPlugin,
  SwcJsMinimizerRspackPlugin,
} = require('@rspack/core');
const path = require('node:path');

// The oldest browsers Vuetify 4 renders in: its styles need CSS cascade layers
// and color-mix(). Without targets the CSS minifier assumed ES6-era browsers
// and rewrote every logical property into per-direction copies with long
// :lang() lists, which tripled the stylesheet.
const BROWSER_TARGETS = [
  'chrome >= 111',
  'edge >= 111',
  'firefox >= 113',
  'safari >= 16.2',
  'ios_saf >= 16.2',
];

// ngraph.graph require()s ngraph.events, which resolves to the package's ES
// module, whose default export require() does not unwrap ("eventify is not a
// function"). The CommonJS build is resolved through package.json, because the
// package does not export it as a subpath.
const ngraphEventsCjs = path.join(
  path.dirname(require.resolve('ngraph.events/package.json')),
  'dist/ngraph.events.cjs'
);

/**
 * Rspack bundles the app's own client and server code; Meteor's bundler still
 * produces the final output and keeps Atmosphere packages working.
 *
 * Beyond an alias both sides share, only the client needs configuration: it is
 * the side that compiles single-file components and stylesheets.
 */
module.exports = defineConfig(Meteor => {
  const resolve = { alias: { 'ngraph.events$': ngraphEventsCjs } };
  if (!Meteor.isClient) return { resolve };
  return {
    resolve: {
      alias: {
        ...resolve.alias,
        // One Vue in the browser: vuedraggable's build require()s vue, which
        // resolved to Vue's CommonJS build, a second copy that also carries
        // the template compiler. Templates are compiled at build time.
        vue$: 'vue/dist/vue.runtime.esm-bundler.js',
      },
    },
    // Hot reloading through Meteor's port (/ws) rather than the dev server's:
    // Windows cannot forward to WSL the ports it reserves, which can include
    // the dev server's (8080)
    devServer: {
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
    },
    optimization: {
      minimizer: [
        new SwcJsMinimizerRspackPlugin(),
        new LightningCssMinimizerRspackPlugin({
          minimizerOptions: { targets: BROWSER_TARGETS },
        }),
      ],
      // Rspack's production values, in development too. With the smaller
      // development chunks, the property forms and viewers that dialogs and
      // pages share were split into a chunk whose stylesheets Rspack could
      // not order ("Conflicting order" warnings on every start).
      splitChunks: {
        minSize: 20000,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
      },
    },
    // Rspack's default budget, 244 KiB per file before compression, is below
    // the two largest files this app needs: the vendor chunk every page loads
    // (Vue, Vuetify's components, vue-i18n...), about 800 KiB, and cytoscape
    // with its klay layout, about 865 KiB, loaded when the dependency graph
    // dialog opens. The budget sits just above them, so that growth such as
    // registering all of Vuetify again shows up as a warning.
    performance: {
      maxAssetSize: 900 * 1024,
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
            // Vue keeps template comments in development builds, and a comment
            // before the root element makes the component a fragment, which
            // an out-in transition does not show
            compilerOptions: {
              comments: false,
            },
          },
        },
      ],
    },
  };
});
