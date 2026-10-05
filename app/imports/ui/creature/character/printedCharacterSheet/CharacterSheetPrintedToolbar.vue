<template>
  <v-app-bar
    class="character-sheet-printed-toolbar"
    v-bind="toolbarProps()"
    :extended="smAndUp"
    :tabs="smAndUp"
    density="compact"
  >
    <v-app-bar-nav-icon
      :aria-label="$t('nav.openMenu')"
      @click="toggleDrawer"
    />
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
    <template #extension>
      <div

        style="width: 100%"
      >
        <v-btn
          class="print-fab"
          color="accent"
          variant="elevated"
          elevation="2"
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
import useUserSurface from '/imports/ui/composables/useUserSurface';
import userColorProps from '/imports/ui/utility/userColor';
import getThemeColor from '/imports/ui/utility/getThemeColor';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { useAppStore } from '/imports/ui/stores/app';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

const appStore = useAppStore();

const route = useRoute();
const { smAndUp } = useDisplay();

const creatureId = computed(() => route.params.id);

const { result: creature } = autorun(() => Creatures.findOne(creatureId.value));

// The character's own colour in its tone for the theme (D2); without one,
// the app bars' ink, as it is
const toolbarProps = (colorProp = 'color') => creature.value?.color
  ? userSurface(creature.value.color, colorProp)
  : userColorProps(toolbarColor.value, colorProp);

const toolbarColor = computed(() => {
  if (creature.value && creature.value.color) {
    return creature.value.color;
  } else {
    return getThemeColor('secondary');
  }
});


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