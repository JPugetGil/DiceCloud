<template>
  <v-app-bar
    class="character-sheet-toolbar"
    :color="toolbarColor"
    :theme="isDark ? 'dark' : 'light'"
    :extended="smAndUp"
    :tabs="smAndUp"
    density="compact"
  >
    <v-app-bar-nav-icon @click="toggleDrawer" />
    <v-fade-transition mode="out-in">
      <v-toolbar-title :key="appStore.pageTitle">
        {{ appStore.pageTitle }}
      </v-toolbar-title>
    </v-fade-transition>
    <v-spacer />
    <v-fade-transition mode="out-in">
      <div
        :key="route.meta.title"
        class="d-flex justify-end flex-shrink-0 flex-grow-0"
      >
        <template v-if="creature">
          <shared-icon :model="creature" />
          <v-menu
            location="bottom left"

            transition="slide-y-transition"
          >
            <template #activator="{ props }">
              <v-btn
                variant="text"
                data-id="creature-menu"
                icon
                v-bind="props"
              >
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list>
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
              <v-list-item @click="showCharacterForm">
                <v-list-item-title>
                  <v-icon start>
                    mdi-pencil
                  </v-icon> {{ $t('sheet.editDetails') }}
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
          <v-app-bar-nav-icon @click="toggleRightDrawer">
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
            :bg-color="toolbarColor"
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
import { computed} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { useDisplay, useTheme } from 'vuetify';

import Creatures from '/imports/api/creature/creatures/Creatures';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { updateUserSharePermissions } from '/imports/api/sharing/sharing';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import CharacterSheetFab from '/imports/client/ui/creature/character/CharacterSheetFab.vue';
import SharedIcon from '/imports/client/ui/components/SharedIcon.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

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

const isOwner = autorun(() => {
  if (!creature.value) return false;
  return Meteor.userId() === creature.value.owner;
}).result;

const ownerName = autorun(() => {
  if (!creature.value) return undefined;
  return Meteor.users.findOne(creature.value.owner)?.username;
}).result;

// Without a creature colour, the same #212121 as the other app bars in both
// themes: they are dark in light mode too (`theme="dark"`), and white text on it
// is 16:1 where the light theme's secondary (#424242) gave 10:1. The active tab
// then takes the dark theme's primary, which is made for dark surfaces
const toolbarColor = computed(() => {
  if (creature.value && creature.value.color) {
    return creature.value.color;
  } else {
    return theme.themes.value.dark.colors.secondary;
  }
});

const isDark = computed(() => isDarkColor(toolbarColor.value));

const printUrl = computed(() => {
  if (!creature.value) return '';
  return `/print-character/${creature.value._id}/${getCreatureUrlName(creature.value)}`;
});

function toggleDrawer() {
  appStore.toggleDrawer();
}

function toggleRightDrawer() {
  appStore.toggleRightDrawer();
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
.character-sheet-toolbar .v-tabs__container--grow .v-tabs__div {
  max-width: 120px !important;
}

.character-sheet-toolbar .v-tabs__bar {
  background: none !important;
}

.character-sheet-extension-fab {
  bottom: -24px;
  right: 8px;
  margin-left: 16px;
}
</style>
