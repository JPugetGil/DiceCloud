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
      <v-app-bar-nav-icon @click="toggleDrawer" />
      <v-toolbar-title>
        <v-fade-transition mode="out-in">
          <div :key="appStore.pageTitle">
            {{ appStore.pageTitle }}
          </div>
        </v-fade-transition>
      </v-toolbar-title>
      <v-spacer />
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
  </v-app>
</template>

<script setup>
import '/imports/api/users/Users';
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import AppSidebar from '/imports/ui/layouts/AppSidebar.vue';
import DialogStack from '/imports/ui/dialogStack/DialogStack.vue';
import SnackbarQueue from '/imports/ui/components/snackbars/SnackbarQueue.vue';
import ConnectionBanner from '/imports/ui/layouts/ConnectionBanner.vue';
import { useAppStore } from '/imports/ui/stores/app';
import { useI18n } from 'vue-i18n';
import { setLocale } from '/imports/ui/i18n';

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
// The account's language wins over this browser's last choice
watch(language, setLocale, { immediate: true });
// Route titles are message keys
const routeTitle = (lang = locale.value) => route.meta?.title
  ? t(route.meta.title, {}, { locale: lang })
  : 'DiceCloud';
watch(route, () => {
  appStore.setPageTitle(routeTitle());
});
// Retranslate the title, unless the page set one of its own (a name...)
watch(locale, (value, oldValue) => {
  if (appStore.pageTitle === routeTitle(oldValue)) appStore.setPageTitle(routeTitle());
});

onMounted(() => colorScheme.addEventListener('change', handleColorSchemeChange));
onUnmounted(() => colorScheme.removeEventListener('change', handleColorSchemeChange));
</script>

<style>

</style>
