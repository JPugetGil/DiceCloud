<template>
  <v-app-bar
    class="character-sheet-printed-toolbar"
    :color="toolbarColor"
    :theme="isDark ? 'dark' : 'light'"
    :extended="smAndUp"
    :tabs="smAndUp"
    density="compact"
  >
    <v-app-bar-nav-icon @click="toggleDrawer" />
    <v-btn
      variant="text"
      icon
      :to="characterUrl"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-toolbar-title>
      <v-fade-transition mode="out-in">
        <div :key="appStore.pageTitle">
          {{ appStore.pageTitle }}
        </div>
      </v-fade-transition>
    </v-toolbar-title>
    <v-spacer />
    <template #extension>
      <div

        style="width: 100%"
      >
        <v-btn
          class="print-fab"
          color="accent"
          variant="elevated"
          elevation="4"
          icon
          @click="doPrint"
        >
          <v-icon>mdi-printer</v-icon>
        </v-btn>
      </div>
    </template>
  </v-app-bar>
</template>

<script setup>
import { computed} from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { autorun } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import getThemeColor from '/imports/client/ui/utility/getThemeColor';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();

const route = useRoute();
const { smAndUp } = useDisplay();

const creatureId = computed(() => route.params.id);

const { result: creature } = autorun(() => Creatures.findOne(creatureId.value));

const toolbarColor = computed(() => {
  if (creature.value && creature.value.color) {
    return creature.value.color;
  } else {
    return getThemeColor('secondary');
  }
});

const isDark = computed(() => isDarkColor(toolbarColor.value));

const characterUrl = computed(() => {
  if (!creature.value) return;
  return `/character/${creature.value._id}/${getCreatureUrlName(creature.value)}`;
});

const toggleDrawer = () => appStore.toggleDrawer();

const doPrint = () => {
  window.print();
};
</script>

<style scoped>
  .print-fab {
    position: absolute;
    bottom: -24px;
    right: 24px;
  }
</style>