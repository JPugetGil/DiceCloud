<template>
  <v-app-bar
    class="character-sheet-toolbar"
    v-bind="toolbarProps()"
    :extended="smAndUp"
    :tabs="smAndUp"
    density="compact"
  >
    <v-app-bar-nav-icon
      :aria-label="$t('nav.openMenu')"
      @click="toggleDrawer"
    />
    <v-fade-transition mode="out-in">
      <!-- The character's name, in the display font (D10) -->
      <v-toolbar-title
        :key="appStore.pageTitle"
        class="font-display"
      >
        {{ appStore.pageTitle }}
      </v-toolbar-title>
    </v-fade-transition>
    <!-- No spacer: Vuetify's title already grows, and a spacer halved its room -->
    <v-fade-transition mode="out-in">
      <div
        :key="route.meta.title"
        class="d-flex justify-end flex-shrink-0 flex-grow-0"
      >
        <template v-if="creature">
          <shared-icon :model="creature" />
          <!-- On a phone it is in the menu: the name needs the room -->
          <v-btn
            v-if="smAndUp"
            variant="text"
            icon
            data-id="character-search"
            :aria-label="$t('characterSearch.open')"
            @click="showSearch"
          >
            <v-icon>mdi-magnify</v-icon>
            <v-tooltip
              activator="parent"
              location="bottom"
            >
              {{ $t('characterSearch.open') }}
            </v-tooltip>
          </v-btn>
          <v-menu
            location="bottom left"

            transition="slide-y-transition"
          >
            <template #activator="{ props }">
              <v-btn
                variant="text"
                data-id="creature-menu"
                icon
                :aria-label="$t('sheet.characterMenu')"
                v-bind="props"
              >
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list>
              <v-list-item
                v-if="!smAndUp"
                data-id="character-search"
                @click="showSearch"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-magnify
                  </v-icon> {{ $t('characterSearch.open') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                v-if="!isOwner && ownerName"
                lines="two"
                disabled
              >
                <template #prepend>
                  <v-avatar>
                    <v-icon>
                      mdi-account
                    </v-icon>
                  </v-avatar>
                </template>

                <v-list-item-title>
                  {{ ownerName }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ $t('sheet.owner') }}
                </v-list-item-subtitle>
              </v-list-item>
              <v-list-item
                v-if="!isOwner"
                @click="unshareWithMe"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-cancel
                  </v-icon> {{ $t('sheet.unshareWithMe') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item :to="printUrl">
                <v-list-item-title>
                  <v-icon start>
                    mdi-printer
                  </v-icon> {{ $t('common.print') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                :to="printCardsUrl"
                data-id="print-cards-menu-item"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-cards-outline
                  </v-icon> {{ $t('printCards.menu') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item @click="showCharacterForm">
                <v-list-item-title>
                  <v-icon start>
                    mdi-pencil
                  </v-icon> {{ $t('sheet.editDetails') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!copyPermission || !!busy"
                data-id="creature-duplicate"
                @click="duplicate"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-content-copy
                  </v-icon> {{ $t('sheet.duplicate') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!copyPermission || !!busy"
                data-id="creature-download"
                @click="download"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-download
                  </v-icon> {{ $t('sheet.download') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!isOwner"
                @click="showShareDialog"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-share-variant
                  </v-icon> {{ $t('common.sharing') }}
                </v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="!isOwner"
                @click="deleteCharacter"
              >
                <v-list-item-title>
                  <v-icon start>
                    mdi-delete
                  </v-icon> {{ $t('common.delete') }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-app-bar-nav-icon
            :aria-label="$t('sheet.toggleLog')"
            data-id="toggle-log"
            @click="toggleRightDrawer"
          >
            <v-icon>mdi-forum</v-icon>
          </v-app-bar-nav-icon>
        </template>
      </div>
    </v-fade-transition>
    <template #extension>
      <v-fade-transition
        v-if="smAndUp"

        mode="out-in"
      >
        <div
          :key="route.meta.title"
          class="d-flex flex-1-1"
        >
          <v-tabs
            v-if="creature && creature.settings"
            :key=" '' +
              creature.settings.hideSpellsTab +
              creature.settings.showTreeTab
            "
            class="flex-1-1"
            style="min-width: 0"
            align-tabs="center"
            grow
            :color="creature.color ? undefined : 'primary'"
            :model-value="appStore.tabById(route.params.id)"
            v-bind="toolbarProps('bg-color')"
            @update:model-value="e => appStore.setTabForCharacterSheet({id: route.params.id, tab: e})"
          >
            <v-tab>
              {{ $t('tabs.stats') }}
            </v-tab>
            <v-tab>
              {{ $t('tabs.actions') }}
            </v-tab>
            <v-tab v-if="!creature.settings.hideSpellsTab">
              {{ $t('tabs.spells') }}
            </v-tab>
            <v-tab>
              {{ $t('tabs.inventory') }}
            </v-tab>
            <v-tab>
              {{ $t('tabs.features') }}
            </v-tab>
            <v-tab>
              {{ $t('tabs.journal') }}
            </v-tab>
            <v-tab>
              {{ $t('tabs.build') }}
            </v-tab>
            <v-tab v-if="creature.settings.showTreeTab">
              {{ $t('tabs.tree') }}
            </v-tab>
          </v-tabs>
          <v-spacer />
          <character-sheet-fab
            direction="bottom"
            class="character-sheet-extension-fab"
            :edit-permission="editPermission"
          />
        </div>
      </v-fade-transition>
    </template>
  </v-app-bar>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { useDisplay, useTheme } from 'vuetify';

import Creatures from '/imports/api/creature/creatures/Creatures';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
import { hasCopyPermission, hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import duplicateCreature from '/imports/api/creature/creatures/methods/duplicateCreature';
import getCreatureArchive from '/imports/api/creature/archive/methods/getCreatureArchive';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { updateUserSharePermissions } from '/imports/api/sharing/sharing';
import useUserSurface from '/imports/ui/composables/useUserSurface';
import userColorProps from '/imports/ui/utility/userColor';
import CharacterSheetFab from '/imports/ui/creature/character/CharacterSheetFab.vue';
import SharedIcon from '/imports/ui/components/SharedIcon.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

const { t } = useI18n();

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const route = useRoute();
const router = useRouter();
const { smAndUp } = useDisplay();
const theme = useTheme();

const creatureId = computed(() => route.params.id);

const creature = autorun(() => Creatures.findOne(creatureId.value)).result;

const editPermission = autorun(() => hasEditPermission(creature.value, Meteor.user())).result;

const copyPermission = autorun(() => hasCopyPermission(creature.value, Meteor.user())).result;

// The menu action running: 'duplicate' or 'download'
const busy = ref(undefined);

const isOwner = autorun(() => {
  if (!creature.value) return false;
  return Meteor.userId() === creature.value.owner;
}).result;

const ownerName = autorun(() => {
  if (!creature.value) return undefined;
  return Meteor.users.findOne(creature.value.owner)?.username;
}).result;

// Without a creature colour, the dark theme's `secondary` ink, as the other app
// bars in both themes: they are dark in light mode too (`theme="dark"`). The
// active tab then takes the dark theme's primary, which is made for dark surfaces
// The character's own colour in its tone for the theme (D2); without one,
// the app bars' ink, as it is
const toolbarProps = (colorProp = 'color') => creature.value?.color
  ? userSurface(creature.value.color, colorProp)
  : userColorProps(toolbarColor.value, colorProp);

const toolbarColor = computed(() => {
  if (creature.value && creature.value.color) {
    return creature.value.color;
  } else {
    return theme.themes.value.dark.colors.secondary;
  }
});


const printUrl = computed(() => {
  if (!creature.value) return '';
  return `/print-character/${creature.value._id}/${getCreatureUrlName(creature.value)}`;
});

const printCardsUrl = computed(() => {
  if (!creature.value) return '';
  return `/print-cards/${creature.value._id}/${getCreatureUrlName(creature.value)}`;
});

function toggleDrawer() {
  appStore.toggleDrawer();
}

function toggleRightDrawer() {
  appStore.toggleRightDrawer();
}

function showSearch() {
  dialogStackStore.pushDialogStack({
    component: 'character-search-dialog',
    elementId: 'character-search',
    data: { creatureId: creatureId.value },
  });
}

function showCharacterForm() {
  dialogStackStore.pushDialogStack({
    component: 'creature-form-dialog',
    elementId: 'creature-menu',
    data: {
      _id: creatureId.value,
    },
  });
}

function showShareDialog() {
  dialogStackStore.pushDialogStack({
    component: 'share-dialog',
    elementId: 'creature-menu',
    data: {
      docRef: {
        id: creatureId.value,
        collection: 'creatures',
      }
    },
  });
}

function deleteCharacter() {
  dialogStackStore.pushDialogStack({
    component: 'delete-confirmation-dialog',
    elementId: 'creature-menu',
    data: {
      name: creature.value.name,
      typeName: t('common.character')
    },
    async callback(confirmation) {
      if (!confirmation) return;
      try {
        await removeCreature.callAsync({ charId: creatureId.value });
        await router.push('/characterList');
      } catch (error) {
        console.error(error);
      }
    }
  });
}

async function duplicate() {
  busy.value = 'duplicate';
  try {
    const copyId = await duplicateCreature.callAsync({
      creatureId: creatureId.value,
      name: t('sheet.copyName', { name: creature.value.name }),
    });
    snackbar({ text: t('sheet.duplicated', { name: creature.value.name }) });
    await router.push(`/character/${copyId}`);
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    busy.value = undefined;
  }
}

// The same file archiving makes, saved by the browser: the character stays
async function download() {
  busy.value = 'download';
  try {
    const archive = await getCreatureArchive.callAsync({ creatureId: creatureId.value });
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(creature.value.name || creatureId.value).replace(/[\\/:*?"<>|]+/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    busy.value = undefined;
  }
}

async function unshareWithMe() {
  try {
    await updateUserSharePermissions.callAsync({
      docRef: {
        collection: 'creatures',
        id: creatureId.value,
      },
      userId: Meteor.userId(),
      role: 'none',
    });
    await router.push('/characterList');
  } catch (error) {
    console.error(error);
  }
}
</script>

<style lang="css">
.character-sheet-extension-fab {
  bottom: -24px;
  right: 8px;
  margin-left: 16px;
}
</style>
