const { defineConfig } = require('@meteorjs/rspack');
// Rspack's fork of vue-loader: vue-loader 17 only emits <style> blocks as CSS
// when `experiments.css` is set, an option Rspack 2 removed
const { VueLoaderPlugin } = require('rspack-vue-loader');
const {
  DefinePlugin,
  LightningCssMinimizerRspackPlugin,
  SwcJsMinimizerRspackPlugin,
} = require('@rspack/core');

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

/**
 * Rspack bundles the app's own client and server code; Meteor's bundler still
 * produces the final output and keeps Atmosphere packages working.
 *
 * Only the client side needs configuration here: it is the side that compiles
 * single-file components and stylesheets.
 */
module.exports = defineConfig(Meteor => {
  if (!Meteor.isClient) return {};
  return {
    resolve: {
      alias: {
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
        overlay: {
          // Vuetify's layout turns transitions off for 100 ms when the page
          // resizes (composables/layout.js): when that happens in the middle
          // of the main area's padding transition, as the app bar changes
          // height while a page loads, the padding jumps inside the layout's
          // ResizeObserver callback and the browser reports this. The size
          // reaches the observer on the next frame: nothing is lost. The
          // function is sent to the browser as text: it stays self-contained
          runtimeErrors: error => !/^ResizeObserver loop/.test(error?.message ?? ''),
        },
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
        // The icon font's legacy formats: every browser the app targets takes
        // the woff2 that its @font-face lists first, so these are not written
        // to the bundle (the eot and the ttf, about 1 MB each, were over the
        // budget above)
        {
          test: /@mdi[\\/]font[\\/]fonts[\\/].*\.(eot|ttf|woff)$/,
          type: 'asset/resource',
          generator: { emit: false },
        },
        {
          test: /\.vue$/,
          loader: 'rspack-vue-loader',
          options: {
            // Required for <style> blocks to reach Rspack's native CSS
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
