import 'vue-router';

// The fields the app's routes put in `meta` (imports/ui/router.js)
declare module 'vue-router' {
  interface RouteMeta {
    // The i18n key of the page's title
    title?: string;
    // Navigating to the route scrolls back to the top
    scrollToTop?: boolean;
  }
}
