// akryum:vue-component 0.16.0 rewrites every <script> block to lang="js" and
// then looks the lang up in global.vue.lang, failing the build when nothing
// registered a handler for it. zer0th:meteor-vuetify-loader used to register
// that handler as a side effect of its auto-import pass; the app uses Vuetify's
// precompiled dist build now, so the handler has to come from somewhere. Hand
// the script back untouched and let the compiler's own Babel pass do the rest.
//
// Build plugins share one process, and both sides guard their writes, so this
// works whichever plugin the bundler loads first.
global.vue = global.vue || {};
global.vue.lang = global.vue.lang || {};

if (!global.vue.lang.js) {
  global.vue.lang.js = function (options) {
    return {
      script: options.source,
      useBabel: true,
    };
  };
}

// The same compiler builds its errors with `new TemplatingTools.CompileError()`
// without loading templating-tools into the plugin, so any genuine compile
// error dies as "TemplatingTools is not defined" and the real message is lost.
// A stand-in with the one constructor it touches keeps those errors readable.
if (typeof global.TemplatingTools === 'undefined') {
  function CompileError() {}
  CompileError.prototype = Object.create(Error.prototype);
  CompileError.prototype.constructor = CompileError;
  global.TemplatingTools = { CompileError: CompileError };
}
