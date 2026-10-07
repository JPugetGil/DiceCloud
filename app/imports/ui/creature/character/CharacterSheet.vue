<template>
  <div
    class="character-sheet fill-height"
    :class="{ 'character-sheet--phone': xs }"
  >
    <!-- The page fades the sheet in over its skeleton (CharacterSheetPage): no fade of its own -->
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
      <!--
        Tabs change with a fade-through, and the window does not slide nor
        animate its height (A8). The tabs used in play are mounted once the
        sheet is idle, so that opening one does not build it first
      -->
      <v-window
        :key=" '' +
          creature.settings?.hideSpellsTab +
          creature.settings?.showTreeTab
        "
        class="character-sheet__window"
        :model-value="appStore.tabById(creatureId)"
        @update:model-value="e => appStore.setTabForCharacterSheet({id: creatureId, tab: e})"
      >
        <v-window-item v-bind="tabItem(true)">
          <stats-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item v-bind="tabItem(true)">
          <actions-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item
          v-if="!creature.settings?.hideSpellsTab"
          v-bind="tabItem(true)"
        >
          <spells-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item v-bind="tabItem(true)">
          <inventory-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item v-bind="tabItem()">
          <features-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item v-bind="tabItem()">
          <character-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item v-bind="tabItem()">
          <build-tab :creature-id="creatureId" />
        </v-window-item>
        <v-window-item
          v-if="creature.settings?.showTreeTab"
          v-bind="tabItem()"
        >
          <tree-tab :creature-id="creatureId" />
        </v-window-item>
      </v-window>
      <!-- A party board's monster: the licence of the bestiary it comes from, at the end of the sheet -->
      <monster-license
        v-if="creature.templateId"
        class="character-sheet__license px-4 pb-4"
        :template-id="creature.templateId"
      />
    </div>
    <value-change-summary />
    <level-up-card
      v-if="creature"
      :creature-id="creatureId"
    />
    <character-sheet-fab
      v-if="xs"
      direction="top"
      fixed
      class="character-sheet-bottom-fab"
      :edit-permission="editPermission"
    />
    <!--
      Material's navigation bar: at most five destinations, always labelled.
      The tabs that do not fit are under More, which takes the name of the
      one open. Build is a destination while the character has choices left,
      then moves under More
    -->
    <v-bottom-navigation
      v-if="xs && creature && creature.settings"
      grow
      color="primary"
      class="bottom-nav-btns"
      data-id="sheet-bottom-nav"
      :model-value="activeMoreTab ? 'more' : activeTab"
      @update:model-value="value => value && value !== 'more' && selectTab(value)"
    >
      <v-btn
        v-for="tab in barTabs"
        :key="tab.name"
        :value="tab.name"
        :data-id="`sheet-tab-${tab.name}`"
      >
        <v-badge
          dot
          color="primary"
          :model-value="tab.name === 'build'"
        >
          <v-icon>{{ tab.icon }}</v-icon>
        </v-badge>
        <span class="bottom-nav-label">{{ $t(`tabs.${tab.name}`) }}</span>
      </v-btn>
      <v-menu
        location="top end"
        :offset="4"
      >
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            value="more"
            data-id="sheet-tab-more"
            :aria-label="activeMoreTab ? $t('tabs.moreWith', { tab: $t(`tabs.${activeMoreTab.name}`) }) : $t('tabs.more')"
          >
            <v-icon>{{ activeMoreTab ? activeMoreTab.icon : 'mdi-dots-horizontal' }}</v-icon>
            <span class="bottom-nav-label">
              {{ activeMoreTab ? $t(`tabs.${activeMoreTab.name}`) : $t('tabs.more') }}
            </span>
          </v-btn>
        </template>
        <v-list
          density="compact"
          color="primary"
          data-id="sheet-tab-more-menu"
        >
          <v-list-item
            v-for="tab in moreTabs"
            :key="tab.name"
            :prepend-icon="tab.icon"
            :title="$t(`tabs.${tab.name}`)"
            :active="activeTab === tab.name"
            :data-id="`sheet-tab-${tab.name}`"
            @click="selectTab(tab.name)"
          />
        </v-list>
      </v-menu>
    </v-bottom-navigation>
  </div>
</template>

<script setup lang="js">
import { computed, ref, watch, onMounted, onBeforeUnmount, provide, reactive } from 'vue';
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
import ValueChangeSummary from '/imports/ui/components/ValueChangeSummary.vue';
import LevelUpCard from '/imports/ui/creature/character/LevelUpCard.vue';
import MonsterLicense from '/imports/ui/creature/party/MonsterLicense.vue';
import ActionsTab from '/imports/ui/creature/character/characterSheetTabs/ActionsTab.vue';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';
import useBuildProgress from '/imports/ui/composables/useBuildProgress';

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

// The phone's navigation bar: four tabs, and More for the rest
const TABS = [
  { name: 'stats', icon: 'mdi-chart-box' },
  { name: 'actions', icon: 'mdi-lightning-bolt' },
  { name: 'spells', icon: 'mdi-fire' },
  { name: 'inventory', icon: 'mdi-cube' },
  { name: 'features', icon: 'mdi-text' },
  { name: 'journal', icon: 'mdi-book-open-variant' },
  { name: 'build', icon: 'mdi-wrench' },
  { name: 'tree', icon: 'mdi-file-tree' },
];
const buildProgress = useBuildProgress(() => props.creatureId);
const choicesLeft = computed(() => editPermission.value && buildProgress.value?.left > 0);
const shownTabs = computed(() => TABS.filter(tab =>
  !(tab.name === 'spells' && creature.value?.settings?.hideSpellsTab)
  && !(tab.name === 'tree' && !creature.value?.settings?.showTreeTab)
));
// While the character has choices left, Build takes the fourth place
const barTabs = computed(() => {
  const tabs = shownTabs.value.filter(tab => tab.name !== 'build').slice(0, 4);
  if (choicesLeft.value) tabs.splice(3, 1, TABS.find(tab => tab.name === 'build'));
  return tabs;
});
const moreTabs = computed(() => shownTabs.value.filter(tab => !barTabs.value.includes(tab)));
const activeTab = computed(() => appStore.tabNameById(props.creatureId));
const activeMoreTab = computed(() => moreTabs.value.find(tab => tab.name === activeTab.value));

// The tabs used in play are mounted ahead, once the sheet has shown and the
// browser is idle; the others when first opened
const warm = ref(false);
let warmHandle;
onMounted(() => {
  const idle = window.requestIdleCallback || (callback => setTimeout(callback, 200));
  warmHandle = idle(() => { warm.value = true; }, { timeout: 2000 });
});
onBeforeUnmount(() => (window.cancelIdleCallback || clearTimeout)(warmHandle));
const tabItem = (main = false) => ({ transition: false, reverseTransition: false, eager: main && warm.value });

function selectTab(name) {
  appStore.setTabForCharacterSheet({ id: props.creatureId, tab: name });
}

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
      added({ _id, content }) {
        if (initializing) return;
        if (appStore.rightDrawer) return;
        if (dialogStackStore.dialogs.length) return;
        // Nothing to show: every line is silenced (a hidden attribute changed)
        if (content?.length && content.every(line => line.silenced)) return;
        // The id lets the snackbar wait for the dice tray (diceTrayState)
        snackbar({ content, logId: _id });
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
/* Five fit a phone: Vuetify's 80px minimum would not */
.bottom-nav-btns .v-btn {
  min-width: 0;
  padding: 0 2px;
}
/* Material's label size (label medium, 12px) */
.bottom-nav-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
}
.character-sheet-bottom-fab {
  z-index: 5;
  bottom: 50px;
}
</style>

<style>
/* clip, not hidden: hidden makes each tab a scroll container, where nothing can stick */
.character-sheet .v-window {
  overflow: clip;
}

.character-sheet .v-window-item {
  min-height: calc(100dvh - var(--v-layout-top) - var(--v-layout-bottom));
  overflow: clip;
}

/* On a phone the floating button sits over the end of the tab: room for it */
.character-sheet--phone .v-window-item {
  padding-bottom: 88px;
}

.dialog-component .character-sheet .v-window-item {
  min-height: unset;
  overflow: unset;
}

/*
 * A tab that opens fades in from 12px below (A8): the one it replaces is gone
 * at once, so the two never overlap and the height never animates. Reduced
 * animations: a fade
 */
.character-sheet__window .v-window-item--active {
  animation: sheet-tab-in var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
}

.reduce-motion .character-sheet__window .v-window-item--active {
  animation: sheet-tab-fade var(--motion-duration-short) linear;
}

@keyframes sheet-tab-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@keyframes sheet-tab-fade {
  from {
    opacity: 0;
  }
}
</style>
