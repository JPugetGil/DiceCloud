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
        // ngraph.graph is CommonJS and require()s ngraph.events, which publishes
        // an ESM and a CommonJS build through its `exports` map. Rspack hands the
        // ESM namespace to that require(), so `eventify` arrives as { default }
        // and every graph construction throws "eventify is not a function".
        'ngraph.events$': ngraphEventsCjs,
      },
    },
    ...Meteor.isServer && {
      // discord.js pulls in prism-media for voice support, which reaches for
      // ffmpeg-static and the optional ws speedups. None of them are installed,
      // and none are used: leaving the requires external keeps prism-media's own
      // try/catch fallbacks in charge, as they are in a plain Node app.
      externals: {
        'ffmpeg-static': 'commonjs ffmpeg-static',
        bufferutil: 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
      },
    },
    ...Meteor.isClient && {
      plugins: [
        new VueLoaderPlugin(),
        // Vue's esm-bundler build expects these to be injected by the bundler,
        // and warns in the console otherwise. The Options API is still in use,
        // so it stays on.
        new DefinePlugin({
          __VUE_OPTIONS_API__: 'true',
          __VUE_PROD_DEVTOOLS__: JSON.stringify(Meteor.isDevelopment),
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
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
                // Vue 3 keeps template comments in development builds only. A
                // comment before a component's root element makes it a fragment
                // there, so attributes stop falling through and <Transition>
                // cannot animate it (docs pages went blank on navigation).
                // Dropping them matches production builds and Vue 2.
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
