<template>
  <div class="character-sheet fill-height">
    <v-fade-transition mode="out-in">
      <div v-if="!creature">
        <div class="d-flex flex-1-1 flex-column align-center justify-center">
          <h2 style="margin: 48px 28px 16px">
            {{ $t('sheet.notFound') }}
          </h2>
          <h3 class="my-0">
            {{ $t('sheet.notFoundText') }}
          </h3>
        </div>
      </div>
      <div
        v-else
        key="character-tabs"
        class="bg-page fill-height"
      >
        <v-window
          :key=" '' +
            creature.settings?.hideSpellsTab +
            creature.settings?.showTreeTab
          "
          :model-value="appStore.tabById(creatureId)"
          @update:model-value="e => appStore.setTabForCharacterSheet({id: creatureId, tab: e})"
        >
          <v-window-item>
            <stats-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item>
            <actions-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item v-if="!creature.settings?.hideSpellsTab">
            <spells-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item>
            <inventory-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item>
            <features-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item>
            <character-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item>
            <build-tab :creature-id="creatureId" />
          </v-window-item>
          <v-window-item v-if="creature.settings?.showTreeTab">
            <tree-tab :creature-id="creatureId" />
          </v-window-item>
        </v-window>
      </div>
    </v-fade-transition>
    <character-sheet-fab
      v-if="xs"
      direction="top"
      fixed
      class="character-sheet-bottom-fab"
      :edit-permission="editPermission"
    />
    <v-bottom-navigation
      v-if="xs && creature && creature.settings"
      mode="shift"
      grow
      mandatory
      color="primary"
      class="bottom-nav-btns"
      :model-value="appStore.tabById(creatureId)"
      @update:model-value="e => appStore.setTabForCharacterSheet({id: creatureId, tab: e})"
    >
      <v-btn>
        <v-icon>mdi-chart-box</v-icon>
        <span>{{ $t('tabs.stats') }}</span>
      </v-btn>
      <v-btn>
        <v-icon>mdi-lightning-bolt</v-icon>
        <span>{{ $t('tabs.actions') }}</span>
      </v-btn>
      <v-btn v-if="!creature.settings?.hideSpellsTab">
        <v-icon>mdi-fire</v-icon>
        <span>{{ $t('tabs.spells') }}</span>
      </v-btn>
      <v-btn>
        <v-icon>mdi-cube</v-icon>
        <span>{{ $t('tabs.inventory') }}</span>
      </v-btn>
      <v-btn>
        <v-icon>mdi-text</v-icon>
        <span>{{ $t('tabs.features') }}</span>
      </v-btn>
      <v-btn>
        <v-icon>mdi-book-open-variant</v-icon>
        <span>{{ $t('tabs.journal') }}</span>
      </v-btn>
      <v-btn>
        <v-icon>mdi-wrench</v-icon>
        <span>{{ $t('tabs.build') }}</span>
      </v-btn>
      <v-btn v-if="creature.settings?.showTreeTab">
        <v-icon>mdi-file-tree</v-icon>
        <span>{{ $t('tabs.tree') }}</span>
      </v-btn>
    </v-bottom-navigation>
  </div>
</template>

<script setup lang="js">
import { computed, watch, onMounted, onBeforeUnmount, provide, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';

import Creatures from '/imports/api/creature/creatures/Creatures';
import StatsTab from '/imports/ui/creature/character/characterSheetTabs/StatsTab.vue';
import FeaturesTab from '/imports/ui/creature/character/characterSheetTabs/FeaturesTab.vue';
import InventoryTab from '/imports/ui/creature/character/characterSheetTabs/InventoryTab.vue';
import SpellsTab from '/imports/ui/creature/character/characterSheetTabs/SpellsTab.vue';
import CharacterTab from '/imports/ui/creature/character/characterSheetTabs/JournalTab.vue';
import BuildTab from '/imports/ui/creature/character/characterSheetTabs/BuildTab.vue';
import TreeTab from '/imports/ui/creature/character/characterSheetTabs/TreeTab.vue';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import CharacterSheetFab from '/imports/ui/creature/character/CharacterSheetFab.vue';
import ActionsTab from '/imports/ui/creature/character/characterSheetTabs/ActionsTab.vue';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const route = useRoute();
const { xs } = useDisplay();

const creature = autorun(() => Creatures.findOne(props.creatureId, {
  fields: { variables: 0 }
})).result;

const editPermission = autorun(() => hasEditPermission(creature.value, Meteor.user())).result;

provide('context', reactive({
  creatureId: computed(() => props.creatureId),
  editPermission,
}));

watch(() => creature.value?.name, (value) => {
  appStore.setPageTitle(value || t('pageTitle.characterSheet'));
});

let nameObserver;
let logObserver;

onMounted(() => {
  appStore.setPageTitle((creature.value && creature.value.name) || t('pageTitle.characterSheet'));
  
  nameObserver = Creatures.find({
    creatureId: props.creatureId,
  }, {
    fields: { name: 1 },
  }).observe({
    added: ({ name }) =>
      appStore.setPageTitle(name || t('pageTitle.characterSheet')),
    changed: ({ name }) =>
      appStore.setPageTitle(name || t('pageTitle.characterSheet')),
  });

  if (route.name === 'characterSheet') {
    // The sheet mounts once the subscription is ready, and observe() calls
    // added for every log already loaded before it returns: skip those, or
    // the last 20 logs queue up as snackbars on every visit
    let initializing = true;
    logObserver = CreatureLogs.find({
      creatureId: props.creatureId,
    }).observe({
      added({ content }) {
        if (initializing) return;
        if (appStore.rightDrawer) return;
        if (dialogStackStore.dialogs.length) return;
        // Nothing to show: every line is silenced (a hidden attribute changed)
        if (content?.length && content.every(line => line.silenced)) return;
        snackbar({ content });
      },
    });
    initializing = false;
  }
});

onBeforeUnmount(() => {
  nameObserver?.stop();
  logObserver?.stop();
});
</script>

<style scoped>
/* Vuetify's 80px minimum pushed 7 tabs past a phone's width, clipping both ends */
.bottom-nav-btns .v-btn {
  min-width: 0;
  padding: 0;
  /* The selected tab's label may run into its neighbours, which show none */
  overflow: visible;
}
.bottom-nav-btns .v-btn__content > span {
  font-size: 0.625rem;
}
.character-sheet-bottom-fab {
  z-index: 5;
  bottom: 50px;
}
</style>

<style>
.character-sheet .v-window-item {
  min-height: calc(100dvh - var(--v-layout-top) - var(--v-layout-bottom));
  overflow: hidden;
}

.dialog-component .character-sheet .v-window-item {
  min-height: unset;
  overflow: unset;
}
</style>
