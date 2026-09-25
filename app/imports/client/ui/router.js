import { createRouter, createWebHistory } from 'vue-router';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';

// Ported from the former akryum:vue-router2 package, which has no Vue 3 successor.
// - only available in html5 history mode
// - defaults to no scroll behavior
// - return false to prevent scroll
const nativeScrollBehavior = (to, from, savedPosition) => {
  if (savedPosition) {
    // savedPosition is only available for popstate navigations.
    return savedPosition;
  }
  const position = {};
  // scroll to anchor by returning the element selector
  if (to.hash) {
    position.el = to.hash;
  }
  // check if any matched route config has meta that requires scrolling to top
  if (to.matched.some(m => m.meta.scrollToTop)) {
    // cords will be used if no selector is provided,
    // or if the selector didn't match any element.
    position.left = 0;
    position.top = 0;
  }
  // if the returned position is falsy or an empty object,
  // will retain current scroll position.
  return position;
};
import MAINTENANCE_MODE from '/imports/constants/MAINTENANCE_MODE';
// Components
const Home = () => import('/imports/client/ui/pages/Home.vue');
const About = () => import('/imports/client/ui/pages/About.vue');
const CharacterList = () => import('/imports/client/ui/pages/CharacterList.vue');
const CharacterListToolbarItems = () => import('/imports/client/ui/creature/creatureList/CharacterListToolbarItems.vue');
const Library = () => import('/imports/client/ui/pages/Library.vue');
const LibraryCollection = () => import('/imports/client/ui/pages/LibraryCollection.vue');
const LibraryCollectionToolbar = () => import('/imports/client/ui/library/LibraryCollectionToolbar.vue');
const LibraryBrowser = () => import('/imports/client/ui/pages/LibraryBrowser.vue');
const CharacterSheetPage = () => import('/imports/client/ui/pages/CharacterSheetPage.vue');
const CharacterSheetToolbar = () => import('/imports/client/ui/creature/character/CharacterSheetToolbar.vue');
const CharacterSheetRightDrawer = () => import('/imports/client/ui/creature/character/CharacterSheetRightDrawer.vue');
const CharacterSheetPrinted = () => import('/imports/client/ui/creature/character/printedCharacterSheet/CharacterSheetPrinted.vue');
const CharacterSheetPrintedToolbar = () => import('/imports/client/ui/creature/character/printedCharacterSheet/CharacterSheetPrintedToolbar.vue');
const SignIn = () => import('/imports/client/ui/pages/SignIn.vue');
const Register = () => import('/imports/client/ui/pages/Register.vue');
const IconAdmin = () => import('/imports/client/ui/icons/IconAdmin.vue');
//const Friends = () => import('/imports/client/ui/pages/Friends.vue' );
const Discord = () => import('/imports/client/ui/pages/Discord.vue');
const FunctionReference = () => import('/imports/client/ui/pages/FunctionReference.vue');
const Account = () => import('/imports/client/ui/pages/Account.vue');
const EmailVerificationSuccess = () => import('/imports/client/ui/pages/EmailVerificationSuccess.vue');
const EmailVerificationError = () => import('/imports/client/ui/pages/EmailVerificationError.vue');
const ResetPassword = () => import('/imports/client/ui/pages/ResetPassword.vue');
const NotImplemented = () => import('/imports/client/ui/pages/NotImplemented.vue');
const SingleLibrary = () => import('/imports/client/ui/pages/SingleLibrary.vue');
const SingleLibraryToolbar = () => import('/imports/client/ui/library/SingleLibraryToolbar.vue');
const Admin = () => import('/imports/client/ui/pages/Admin.vue');
const Maintenance = () => import('/imports/client/ui/pages/Maintenance.vue');
const Files = () => import('/imports/client/ui/pages/Files.vue');
const DocsPage = () => import('/imports/client/ui/pages/DocsPage.vue');
const DocToolbar = () => import('/imports/client/ui/docs/DocToolbar.vue');
const DocsRightDrawer = () => import('/imports/client/ui/docs/DocsRightDrawer.vue');

// Not found
const NotFound = () => import('/imports/client/ui/pages/NotFound.vue');

let userSubscription = Meteor.subscribe('user');


function ensureLoggedIn(to, from, next) {
  Tracker.autorun((computation) => {
    if (userSubscription.ready()) {
      computation.stop();
      const user = Meteor.user();
      if (user) {
        next()
      } else {
        next({ name: 'signIn', query: { redirect: to.path } });
      }
    }
  });
}

function ensureAdmin(to, from, next) {
  Tracker.autorun((computation) => {
    if (userSubscription.ready()) {
      computation.stop();
      const user = Meteor.user();
      if (user) {
        if (user.roles && user.roles.includes('admin')) {
          next()
        } else {
          next({ name: 'home' });
        }
      } else {
        next({ name: 'signIn', query: { redirect: to.path } });
      }
    }
  });
}


function verifyEmail(to, from, next) {
  const token = to.params.token;
  Accounts.verifyEmail(token, error => {
    if (error) {
      next({ name: 'emailVerificationError', params: { error } });
    } else {
      next('/email-verification-success')
    }
  });
}

/** @type {import('vue-router').RouteRecordRaw[]} */
const routes = [{
    path: '/',
    name: 'home',
    components: {
      default: Home,
    },
    meta: {
      title: 'pageTitle.home',
    },
  }, {
    path: '/character-list',
    alias: '/characterList',
    components: {
      default: CharacterList,
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
      default: Library,
    },
    meta: {
      title: 'pageTitle.library',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    name: 'singleLibrary',
    path: '/library/:id',
    components: {
      default: SingleLibrary,
      toolbar: SingleLibraryToolbar,
    },
    meta: {
      title: 'pageTitle.library',
    },
  }, {
    name: 'libraryCollection',
    path: '/library-collection/:id',
    components: {
      default: LibraryCollection,
      toolbar: LibraryCollectionToolbar,
    },
    meta: {
      title: 'pageTitle.libraryCollection',
    },
  }, {
    name: 'libraryBrowser',
    path: '/community-libraries',
    components: {
      default: LibraryBrowser,
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
    path: '/friends',
    components: {
      default: NotImplemented,
    },
    meta: {
      title: 'pageTitle.friends',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    name: 'signIn',
    path: '/sign-in',
    components: {
      default: SignIn,
    },
    meta: {
      title: 'pageTitle.signIn',
    },
  }, {
    name: 'register',
    path: '/register',
    components: {
      default: Register,
    },
    meta: {
      title: 'pageTitle.register',
    },
  }, {
    path: '/account',
    components: {
      default: Account,
    },
    meta: {
      title: 'pageTitle.account',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    path: '/my-files',
    components: {
      default: Files,
    },
    meta: {
      title: 'pageTitle.files',
    },
    beforeEnter: ensureLoggedIn,
  }, {
    path: '/discord',
    components: {
      default: Discord,
    },
    meta: {
      title: 'pageTitle.discord',
    },
  }, {
    path: '/docs/functions',
    components: {
      default: FunctionReference,
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
      default: About,
    },
    meta: {
      title: 'pageTitle.about',
    },
  }, {
    path: '/verify-email/:token',
    beforeEnter: verifyEmail,
  }, {
    name: 'emailVerificationError',
    path: '/email-verification-error',
    components: {
      default: EmailVerificationError,
    },
    props: {
      default: true,
    },
    meta: {
      title: 'pageTitle.emailVerificationError',
    },
  }, {
    path: '/email-verification-success',
    components: {
      default: EmailVerificationSuccess,
    },
    meta: {
      title: 'pageTitle.emailVerificationSuccess',
    },
  }, {
    path: '/reset-password/:token?',
    components: {
      default: ResetPassword,
    },
    meta: {
      title: 'pageTitle.resetPassword',
    },
  }, {
    path: '/icon-admin',
    name: 'iconAdmin',
    component: IconAdmin,
    beforeEnter: ensureAdmin,
  }, {
    path: '/admin',
    name: 'admin',
    component: Admin,
    beforeEnter: ensureAdmin,
  }, {
    path: '/maintenance',
    name: 'maintenance',
    component: Maintenance,
  },
];

// Not found route has lowest priority, so it must be registered last
routes.push({
  path: '/:pathMatch(.*)*',
  component: NotFound,
});

function redirectIfMaintenance(to, from, next) {
  if (!MAINTENANCE_MODE) return next();
  if (
    to?.path === '/admin' ||
    to?.path === '/maintenance' ||
    to?.path === '/sign-in'
  ) return next();
  Tracker.autorun((computation) => {
    if (userSubscription.ready()) {
      computation.stop();
      const user = Meteor.user();
      if (user && user.roles && user.roles.includes('admin')) {
        next({ name: 'admin' })
      } else {
        next({ name: 'maintenance' });
      }
    }
  });
}

// Create the router instance
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: nativeScrollBehavior,
  routes,
});
router.beforeEach(redirectIfMaintenance);
export default router;
