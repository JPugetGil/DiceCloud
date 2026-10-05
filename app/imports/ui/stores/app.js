import { defineStore } from 'pinia';
import Creatures from '/imports/api/creature/creatures/Creatures';

const tabs = ['stats', 'actions', 'spells', 'inventory', 'features', 'journal', 'build', 'tree'];
const tabsWithoutSpells = ['stats', 'actions', 'inventory', 'features', 'journal', 'build', 'tree'];

export const useAppStore = defineStore('app', {
  state: () => ({
    drawer: undefined,
    rightDrawer: undefined,
    pageTitle: undefined,
    characterSheetTabs: {},
    formExpansions: {},
    // Docs writers switch the documentation pages between reading and editing
    editingDocs: false,
    // The character whose sheet has loaded: its log rolls in only newer entries
    loadedCharacterId: undefined,
  }),
  getters: {
    tabById: (state) => (id) => {
      return state.characterSheetTabs[id] ?? 0;
    },
    tabNameById: (state) => (id) => {
      const tabNumber = state.characterSheetTabs[id] ?? 0;
      const creature = Creatures.findOne(id);
      if (creature?.settings?.hideSpellsTab) {
        return tabsWithoutSpells[tabNumber];
      } else {
        return tabs[tabNumber]
      }
    },
    formExpansionByType: (state) => (type) => {
      return state.formExpansions[type] || [];
    },
  },
  actions: {
    toggleDrawer() {
      this.drawer = !this.drawer;
    },
    toggleRightDrawer() {
      this.rightDrawer = !this.rightDrawer;
    },
    setDrawer(value) {
      this.drawer = value;
    },
    setRightDrawer(value) {
      this.rightDrawer = value;
    },
    setPageTitle(value) {
      this.pageTitle = value;
      if (typeof document !== 'undefined') {
        document.title = value;
      }
    },
    setTabForCharacterSheet({ tab, id }) {
      if (typeof tab === 'string') {
        const tabInput = tab;
        const creature = Creatures.findOne(id);
        if (creature?.settings?.hideSpellsTab) {
          tab = tabsWithoutSpells.indexOf(tab);
        } else {
          tab = tabs.indexOf(tab);
        }
        if (!(tab > -1)) {
          console.warn(`could not find a tab called ${tabInput}`);
          tab = 0;
        }
      }
      this.characterSheetTabs[id] = tab;
    },
    setFormExpansion({ type, value }) {
      this.formExpansions[type] = value;
    },
    toggleEditingDocs() {
      this.editingDocs = !this.editingDocs;
    },
  },
});
