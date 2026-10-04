// Vue single-file components, for TypeScript and checkJs: the files that
// import them know they are components, without checking their props
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}
