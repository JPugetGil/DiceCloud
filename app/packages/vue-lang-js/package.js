Package.describe({
  name: 'dicecloud:vue-lang-js',
  version: '1.0.0',
  summary: 'Registers the <script lang="js"> handler akryum:vue-component expects',
  documentation: null,
});

Package.registerBuildPlugin({
  name: 'vueLangJs',
  sources: ['plugin.js'],
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});
