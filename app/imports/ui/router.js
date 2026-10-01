import { createRouter, createWebHistory } from 'vue-router';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import MAINTENANCE_MODE from '/imports/constants/MAINTENANCE_MODE';

// The element an anchor (`#section`) names. Pages render their content after
// the navigation (a doc arrives from its subscription), so the element is
// waited for rather than looked up once, which found nothing.
function waitForAnchor(hash, timeout = 5000) {
  const id = decodeURIComponent(hash.slice(1));
  const find = () => document.getElementById(id);
  return new Promise(resolve => {
    if (find()) return resolve(find());
    const observer = new MutationObserver(() => {
      if (!find()) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve(find());
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Scroll behaviour:
// - only available in html5 history mode
// - defaults to no scroll behavior
// - return false to prevent scroll
const nativeScrollBehavior = async (to, from, savedPosition) => {
  if (savedPosition) {
    // savedPosition is only available for popstate navigations.
    return savedPosition;
  }
  // Scroll to the anchor, clear of the app bar that stays over the page
  if (to.hash) {
    const el = await waitForAnchor(to.hash);
    if (el) return { el, top: (document.querySelector('.v-app-bar')?.offsetHeight ?? 0) + 16 };
  }
  const position = {};
  // check if any matched route config has meta that requires scrolling to top
  if (to.matched.some(m => m.meta.scrollToTop)) {
    position.left = 0;
    position.top = 0;
  }
  // if the returned position is falsy or an empty object,
  // will retain current scroll position.
  return position;
};

// Components
const HomePage = () => import('/imports/ui/pages/HomePage.vue');
const AboutPage = () => import('/imports/ui/pages/AboutPage.vue');
const LegalPage = () => import('/imports/ui/pages/LegalPage.vue');
const CharacterListPage = () => import('/imports/ui/pages/CharacterListPage.vue');
const CharacterListToolbarItems = () => import('/imports/ui/creature/creatureList/CharacterListToolbarItems.vue');
const LibraryPage = () => import('/imports/ui/pages/LibraryPage.vue');
const LibraryCollectionPage = () => import('/imports/ui/pages/LibraryCollectionPage.vue');
const LibraryCollectionToolbar = () => import('/imports/ui/library/LibraryCollectionToolbar.vue');
const LibraryBrowserPage = () => import('/imports/ui/pages/LibraryBrowserPage.vue');
const CharacterSheetPage = () => import('/imports/ui/pages/CharacterSheetPage.vue');
const CharacterSheetToolbar = () => import('/imports/ui/creature/character/CharacterSheetToolbar.vue');
const CharacterSheetRightDrawer = () => import('/imports/ui/creature/character/CharacterSheetRightDrawer.vue');
const CharacterSheetPrinted = () => import('/imports/ui/creature/character/printedCharacterSheet/CharacterSheetPrinted.vue');
const CharacterSheetPrintedToolbar = () => import('/imports/ui/creature/character/printedCharacterSheet/CharacterSheetPrintedToolbar.vue');
const SignInPage = () => import('/imports/ui/pages/SignInPage.vue');
const RegisterPage = () => import('/imports/ui/pages/RegisterPage.vue');
const IconAdmin = () => import('/imports/ui/icons/IconAdmin.vue');
const DiscordPage = () => import('/imports/ui/pages/DiscordPage.vue');
const FunctionReferencePage = () => import('/imports/ui/pages/FunctionReferencePage.vue');
const AccountPage = () => import('/imports/ui/pages/AccountPage.vue');
const EmailVerificationSuccessPage = () => import('/imports/ui/pages/EmailVerificationSuccessPage.vue');
const EmailVerificationErrorPage = () => import('/imports/ui/pages/EmailVerificationErrorPage.vue');
const ResetPasswordPage = () => import('/imports/ui/pages/ResetPasswordPage.vue');
const SingleLibraryPage = () => import('/imports/ui/pages/SingleLibraryPage.vue');
const SingleLibraryToolbar = () => import('/imports/ui/library/SingleLibraryToolbar.vue');
const AdminPage = () => import('/imports/ui/pages/AdminPage.vue');
const MaintenancePage = () => import('/imports/ui/pages/MaintenancePage.vue');
const FilesPage = () => import('/imports/ui/pages/FilesPage.vue');
const DocsPage = () => import('/imports/ui/pages/DocsPage.vue');
const DocToolbar = () => import('/imports/ui/docs/DocToolbar.vue');
const DocsRightDrawer = () => import('/imports/ui/docs/DocsRightDrawer.vue');

// Not found
const NotFoundPage = () => import('/imports/ui/pages/NotFoundPage.vue');

let userSubscription = Meteor.subscribe('user');


/**
 * The signed-in user, or null, once the user's own document has arrived.
 */
function currentUser() {
  return new Promise(resolve => {
    Tracker.autorun((computation) => {
      if (userSubscription.ready()) {
        computation.stop();
        resolve(Meteor.user());
      }
    });
  });
}

// Navigation guards return where to go instead, or nothing to carry on
async function ensureLoggedIn(to) {
  const user = await currentUser();
  if (!user) return { name: 'signIn', query: { redirect: to.path } };
}

async function ensureAdmin(to) {
  const user = await currentUser();
  if (!user) return { name: 'signIn', query: { redirect: to.path } };
  if (!user.roles?.includes('admin')) return { name: 'home' };
}

function verifyEmail(to) {
  return new Promise(resolve => {
    Accounts.verifyEmail(to.params.token, error => {
      if (error) {
        resolve({
          name: 'emailVerificationError',
          query: { error: error.reason || error.message },
        });
      } else {
        resolve('/email-verification-success');
      }
    });
  });
}

/** @type {import('vue-router').RouteRecordRaw[]} */
const routes = [{
    path: '/',
    name: 'home',
    components: {
      default: HomePage,
    },
    meta: {
      title: 'pageTitle.home',
    },
  }, {
    path: '/character-list',
    alias: '/characterList',
    components: {
      default: CharacterListPage,
      toolbarItems: CharacterListToolbarItems,
    },
    meta: {
      title: 'pageTitle.characterList',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    name: 'library',
    path: '/library',
    components: {
      default: LibraryPage,
    },
    meta: {
      title: 'pageTitle.library',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    name: 'singleLibrary',
    path: '/library/:id',
    components: {
      default: SingleLibraryPage,
      toolbar: SingleLibraryToolbar,
    },
    meta: {
      title: 'pageTitle.library',
    },
  }, {
    name: 'libraryCollection',
    path: '/library-collection/:id',
    components: {
      default: LibraryCollectionPage,
      toolbar: LibraryCollectionToolbar,
    },
    meta: {
      title: 'pageTitle.libraryCollection',
    },
  }, {
    name: 'libraryBrowser',
    path: '/community-libraries',
    components: {
      default: LibraryBrowserPage,
    },
    meta: {
      title: 'pageTitle.communityLibraries',
    },
  }, {
    name: 'characterSheet',
    // The name segment is cosmetic. Vue Router 4 requires an alias to share
    // every param with its route, so it is an optional param instead
    path: '/character/:id/:urlName?',
    components: {
      default: CharacterSheetPage,
      toolbar: CharacterSheetToolbar,
      rightDrawer: CharacterSheetRightDrawer,
    },
    meta: {
      title: 'pageTitle.characterSheet',
    },
  }, {
    name: 'printCharacterSheet',
    path: '/print-character/:id/:urlName?',
    components: {
      default: CharacterSheetPrinted,
      toolbar: CharacterSheetPrintedToolbar,
    },
    meta: {
      title: 'pageTitle.printCharacterSheet',
    },
  }, {
    name: 'signIn',
    path: '/sign-in',
    components: {
      default: SignInPage,
    },
    meta: {
      title: 'pageTitle.signIn',
    },
  }, {
    name: 'register',
    path: '/register',
    components: {
      default: RegisterPage,
    },
    meta: {
      title: 'pageTitle.register',
    },
  }, {
    path: '/account',
    components: {
      default: AccountPage,
    },
    meta: {
      title: 'pageTitle.account',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    path: '/my-files',
    components: {
      default: FilesPage,
    },
    meta: {
      title: 'pageTitle.files',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    path: '/discord',
    components: {
      default: DiscordPage,
    },
    meta: {
      title: 'pageTitle.discord',
    },
  }, {
    path: '/docs/functions',
    components: {
      default: FunctionReferencePage,
    },
    meta: {
      title: 'pageTitle.functions',
    },
  }, {
    path: '/docs/:docPath([^/]+.*)?',
    components: {
      default: DocsPage,
      toolbar: DocToolbar,
      rightDrawer: DocsRightDrawer,
    },
    meta: {
      title: 'pageTitle.documentation',
    },
  }, {
    path: '/about',
    components: {
      default: AboutPage,
    },
    meta: {
      title: 'pageTitle.about',
    },
  }, {
    path: '/privacy',
    components: {
      default: LegalPage,
    },
    props: {
      default: { document: 'privacy' },
    },
    meta: {
      title: 'pageTitle.privacy',
    },
  }, {
    path: '/terms',
    components: {
      default: LegalPage,
    },
    props: {
      default: { document: 'terms' },
    },
    meta: {
      title: 'pageTitle.terms',
    },
  }, {
    path: '/verify-email/:token',
    beforeEnter: verifyEmail,
  }, {
    name: 'emailVerificationError',
    path: '/email-verification-error',
    components: {
      default: EmailVerificationErrorPage,
    },
    props: {
      default: route => ({ error: route.query.error }),
    },
    meta: {
      title: 'pageTitle.emailVerificationError',
    },
  }, {
    path: '/email-verification-success',
    components: {
      default: EmailVerificationSuccessPage,
    },
    meta: {
      title: 'pageTitle.emailVerificationSuccess',
    },
  }, {
    path: '/reset-password/:token?',
    components: {
      default: ResetPasswordPage,
    },
    meta: {
      title: 'pageTitle.resetPassword',
    },
  }, {
    path: '/icon-admin',
    name: 'iconAdmin',
    component: IconAdmin,
    meta: {
      title: 'pageTitle.iconAdmin',
    },
    beforeEnter: ensureAdmin,
  }, {
    path: '/admin',
    name: 'admin',
    component: AdminPage,
    meta: {
      title: 'pageTitle.administration',
    },
    beforeEnter: ensureAdmin,
  }, {
    path: '/maintenance',
    name: 'maintenance',
    component: MaintenancePage,
    meta: {
      title: 'pageTitle.maintenance',
    },
  },
];

// Not found route has lowest priority, so it must be registered last
routes.push({
  path: '/:pathMatch(.*)*',
  component: NotFoundPage,
});

async function redirectIfMaintenance(to) {
  if (!MAINTENANCE_MODE) return;
  if (
    to.path === '/admin' ||
    to.path === '/maintenance' ||
    to.path === '/sign-in'
  ) return;
  const user = await currentUser();
  if (user?.roles?.includes('admin')) {
    return { name: 'admin' };
  } else {
    return { name: 'maintenance' };
  }
}

// Create the router instance
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: nativeScrollBehavior,
  routes,
});
router.beforeEach(redirectIfMaintenance);
export default router;
