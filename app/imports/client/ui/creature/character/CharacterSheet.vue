<template>
  <div class="character-sheet fill-height">
    <v-fade-transition mode="out-in">
      <div v-if="!creature">
        <div class="d-flex flex-1-1 flex-column align-center justify-center">
          <h2 style="margin: 48px 28px 16px">
            Character not found
          </h2>
          <h3>
            Either this character does not exist, or you don't have permission
            to view it.
          </h3>
        </div>
      </div>
      <div
        v-else
        key="character-tabs"
        class="card-background fill-height"
      >
        <v-window
          :key=" '' +
            creature.settings.hideSpellsTab +
            creature.settings.showTreeTab
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
          <v-window-item v-if="!creature.settings.hideSpellsTab">
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
          <v-window-item v-if="creature.settings.showTreeTab">
            <tree-tab :creature-id="creatureId" />
          </v-window-item>
        </v-window>
      </div>
    </v-fade-transition>
    <character-sheet-fab
      v-if="!embedded && xs"
      direction="top"
      fixed
      class="character-sheet-bottom-fab"
      :edit-permission="editPermission"
    />
    <v-bottom-navigation
      v-if="!embedded && xs && creature && creature.settings"
      shift
      mandatory
      class="bottom-nav-btns"
      :model-value="appStore.tabById(creatureId)"
      @update:model-value="e => appStore.setTabForCharacterSheet({id: creatureId, tab: e})"
    >
      <v-btn>
        <span>Stats</span>
        <v-icon>mdi-chart-box</v-icon>
      </v-btn>
      <v-btn>
        <span>Actions</span>
        <v-icon>mdi-lightning-bolt</v-icon>
      </v-btn>
      <v-btn v-if="!creature.settings.hideSpellsTab">
        <span>Spells</span>
        <v-icon>mdi-fire</v-icon>
      </v-btn>
      <v-btn>
        <span>Inventory</span>
        <v-icon>mdi-cube</v-icon>
      </v-btn>
      <v-btn>
        <span>Features</span>
        <v-icon>mdi-text</v-icon>
      </v-btn>
      <v-btn>
        <span>Journal</span>
        <v-icon>mdi-book-open-variant</v-icon>
      </v-btn>
      <v-btn>
        <span>Build</span>
        <v-icon>mdi-wrench</v-icon>
      </v-btn>
      <v-btn v-if="creature.settings.showTreeTab">
        <span>Tree</span>
        <v-icon>mdi-file-tree</v-icon>
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

//TODO add a "no character found" screen if shown on a false address
// or on a character the user does not have permission to view
import Creatures from '/imports/api/creature/creatures/Creatures';
import StatsTab from '/imports/client/ui/creature/character/characterSheetTabs/StatsTab.vue';
import FeaturesTab from '/imports/client/ui/creature/character/characterSheetTabs/FeaturesTab.vue';
import InventoryTab from '/imports/client/ui/creature/character/characterSheetTabs/InventoryTab.vue';
import SpellsTab from '/imports/client/ui/creature/character/characterSheetTabs/SpellsTab.vue';
import CharacterTab from '/imports/client/ui/creature/character/characterSheetTabs/JournalTab.vue';
import BuildTab from '/imports/client/ui/creature/character/characterSheetTabs/BuildTab.vue';
import TreeTab from '/imports/client/ui/creature/character/characterSheetTabs/TreeTab.vue';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import CharacterSheetFab from '/imports/client/ui/creature/character/CharacterSheetFab.vue';
import ActionsTab from '/imports/client/ui/creature/character/characterSheetTabs/ActionsTab.vue';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  embedded: Boolean,
});

defineEmits(['update:tabs']);

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
  appStore.setPageTitle(value || 'Character Sheet');
});

let nameObserver;
let logObserver;

onMounted(() => {
  appStore.setPageTitle((creature.value && creature.value.name) || 'Character Sheet');
  
  nameObserver = Creatures.find({
    creatureId: props.creatureId,
  }, {
    fields: { name: 1 },
  }).observe({
    added: ({ name }) =>
      appStore.setPageTitle(name || 'Character Sheet'),
    changed: ({ name }) =>
      appStore.setPageTitle(name || 'Character Sheet'),
  });

  if (route.name === 'characterSheet') {
    logObserver = CreatureLogs.find({
      creatureId: props.creatureId,
    }).observe({
      added({ content }) {
        if (appStore.rightDrawer) return;
        if (dialogStackStore.dialogs.length) return;
        snackbar({ content });
      },
    });
  }
});

onBeforeUnmount(() => {
  nameObserver?.stop();
  logObserver?.stop();
});
</script>

<style scoped>
.bottom-nav-btns > .v-btn{
  min-width: 0 !important;
  padding: 0 !important;
  flex: 1 1 auto !important;
  font-size: 0.6rem !important;
}
.character-sheet-bottom-fab {
  z-index: 5;
  bottom: 50px;
}
</style>

<style>
.character-sheet .v-window-item {
  min-height: calc(100vh - 96px);
  overflow: hidden;
}

.dialog-component .character-sheet .v-window-item {
  min-height: unset;
  overflow: unset;
}
</style>
