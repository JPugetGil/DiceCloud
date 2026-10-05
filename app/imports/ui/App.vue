<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawer"
      color="drawer"
    >
      <AppSidebar />
    </v-navigation-drawer>
    <router-view name="toolbar" />
    <v-app-bar
      v-if="!route.matched[0] || !route.matched[0].components.toolbar"
      color="secondary"
      theme="dark"
    >
      <v-app-bar-nav-icon
        :aria-label="$t('nav.openMenu')"
        @click="toggleDrawer"
      />
      <v-toolbar-title>
        <v-fade-transition mode="out-in">
          <div :key="appStore.pageTitle">
            {{ appStore.pageTitle }}
          </div>
        </v-fade-transition>
      </v-toolbar-title>
      <!-- No spacer: Vuetify's title already grows, and a spacer halved its room -->
      <v-fade-transition mode="out-in">
        <div
          :key="route.meta.title"
          class="text-truncate"
        >
          <router-view name="toolbarItems" />
        </div>
      </v-fade-transition>
    </v-app-bar>
    <v-main>
      <connection-banner />
      <router-view v-slot="{ Component }">
        <v-fade-transition hide-on-leave>
          <component :is="Component" />
        </v-fade-transition>
      </router-view>
    </v-main>
    <router-view name="rightDrawer" />
    <dialog-stack />
    <snackbar-queue />
    <dice-tray
      v-if="appStore.loadedCharacterId"
      :key="appStore.loadedCharacterId"
      :creature-id="appStore.loadedCharacterId"
    />
    <!-- Read by screen readers: rolls and what else announce() is given -->
    <div
      class="d-sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-id="announcer"
    >
      {{ announcement }}
    </div>
  </v-app>
</template>

<script setup>
import '/imports/api/users/Users';
import { computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import AppSidebar from '/imports/ui/layouts/AppSidebar.vue';
import DialogStack from '/imports/ui/dialogStack/DialogStack.vue';
import SnackbarQueue from '/imports/ui/components/snackbars/SnackbarQueue.vue';
import ConnectionBanner from '/imports/ui/layouts/ConnectionBanner.vue';

// Thrown on a character's sheet, once its log is loaded: loaded with the first
const DiceTray = defineAsyncComponent(() => import('/imports/ui/dice/DiceTray.vue'));
import { useAppStore } from '/imports/ui/stores/app';
import { useI18n } from 'vue-i18n';
import { setLocale } from '/imports/ui/i18n';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { announcement } from '/imports/ui/components/announcer';

const appStore = useAppStore();
const { t, locale } = useI18n();

const route = useRoute();
const theme = useTheme();
const darkMode = autorun(() => Meteor.user()?.darkMode ?? null).result;
const language = autorun(() => Meteor.user()?.preferences?.language).result;
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

const drawer = computed({
  get: () => appStore.drawer,
  set: value => appStore.setDrawer(value),
});

function applyTheme(value) {
  const useDarkTheme = typeof value === 'boolean' ? value : colorScheme.matches;
  theme.change(useDarkTheme ? 'dark' : 'light');
}

function handleColorSchemeChange(event) {
  if (typeof darkMode.value !== 'boolean') applyTheme(event.matches);
}

function toggleDrawer() {
  appStore.toggleDrawer();
}

watch(darkMode, applyTheme, { immediate: true });
// Reduced animations (stylesheets/motion.css): Vuetify's transitions become fades
const reducedMotion = useReducedMotion();
watch(reducedMotion, reduced => {
  document.documentElement.classList.toggle('reduce-motion', reduced);
}, { immediate: true });
// The account's language wins over this browser's last choice
watch(language, setLocale, { immediate: true });
// Route titles are message keys
const routeTitle = (lang = locale.value) => route.meta?.title
  ? t(route.meta.title, {}, { locale: lang })
  : 'DiceCloud';
// On a new page, the first one included (its name changes from none, though
// "/" is also where the router starts): closing a dialog goes back in the
// history without leaving the page, which keeps its own title (a name)
watch(() => `${String(route.name)} ${route.path}`, () => {
  appStore.setPageTitle(routeTitle());
});
// Retranslate the title, unless the page set one of its own (a name...)
watch(locale, (value, oldValue) => {
  if (appStore.pageTitle === routeTitle(oldValue)) appStore.setPageTitle(routeTitle());
});

onMounted(() => colorScheme.addEventListener('change', handleColorSchemeChange));
onUnmounted(() => colorScheme.removeEventListener('change', handleColorSchemeChange));
</script>
