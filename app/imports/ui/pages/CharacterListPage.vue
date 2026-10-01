<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <v-container>
      <v-row
        class="mb-16 justify-center"
      >
        <v-col
          cols="12"
          xl="8"
        >
          <v-card
            v-if="hasCharacters || !ready"
            :class="{ 'mb-4': folders && folders.length }"
          >
            <creature-folder-list
              :creatures="CreaturesWithNoParty"
              :folders="folders"
            />
          </v-card>
          <v-card v-else>
            <v-empty-state
              icon="mdi-account-plus-outline"
              :title="$t('characterList.emptyTitle')"
              :text="$t('characterList.emptyText')"
            />
          </v-card>
          <div class="d-flex flex-wrap justify-end align-center ga-2 mt-3">
            <v-chip
              v-if="characterLimit !== Infinity"
              class="mr-auto"
              variant="tonal"
              prepend-icon="mdi-account-multiple-outline"
              data-id="character-count"
            >
              {{ $t('characterList.characterCount', { count: ownedCharacterCount, limit: characterLimit }) }}
            </v-chip>
            <v-btn
              v-if="showImportButton"
              variant="text"
              prepend-icon="mdi-file-import-outline"
              data-id="import-character-button"
              @click="importCharacter"
            >
              {{ $t('characterList.importCharacter') }}
            </v-btn>
            <v-btn
              variant="text"
              prepend-icon="mdi-folder-plus-outline"
              :loading="loadingInsertFolder"
              @click="insertFolder"
            >
              {{ $t('characterList.addFolder') }}
            </v-btn>
          </div>
          <v-btn
            color="primary"
            size="large"
            :icon="xs"
            :prepend-icon="xs ? undefined : 'mdi-plus'"
            rounded="lg"
            elevation="4"
            position="fixed"
            class="ma-4"
            location="bottom right"
            :aria-label="$t('characterList.newCharacter')"
            data-id="new-character-button"
            @click="insertCharacter"
          >
            <v-icon v-if="xs">
              mdi-plus
            </v-icon>
            <template v-else>
              {{ $t('characterList.newCharacter') }}
            </template>
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="js">
import { ref, computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import insertCreatureFolder from '/imports/api/creature/creatureFolders/methods/insertCreatureFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import CreatureFolderList from '/imports/ui/creature/creatureList/CreatureFolderList.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { uniq, flatten } from 'lodash';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useUserRole from '/imports/ui/composables/useUserRole';
import { ROLES } from '/imports/api/users/roles';
import { useI18n } from 'vue-i18n';

const dialogStackStore = useDialogStackStore();
const { t } = useI18n();
const { role, permissions } = useUserRole();


const characterTransform = function (char) {
  char.url = `/character/${char._id}/${getCreatureUrlName(char)}`;
  char.initial = char.name && char.name[0] || '?';
  return char;
};

const loadingInsertFolder = ref(false);

const { ready } = subscribe('characterList');
const { xs } = useDisplay();
const router = useRouter();

const { result: folders } = autorun(() => {
  const userId = Meteor.userId();
  let folders = CreatureFolders.find(
    { owner: userId, archived: { $ne: true } },
    { sort: { name: 1 } },
  ).map(folder => {
    folder.creatures = Creatures.find(
      {
        _id: { $in: folder.creatures || [] },
        $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      }, {
      sort: { name: 1 },
    }
    ).map(characterTransform);
    return folder;
  });
  return folders;
});

const { result: CreaturesWithNoParty } = autorun(() => {
  var userId = Meteor.userId();
  var charArrays = CreatureFolders.find({ owner: userId }).map(p => p.creatures);
  var folderChars = uniq(flatten(charArrays));
  return Creatures.find(
    {
      _id: { $nin: folderChars },
      $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
    },
    { sort: { name: 1 } }
  ).map(characterTransform);
});

// Folders show even while empty: they are where characters are dropped
const hasCharacters = computed(() =>
  !!(CreaturesWithNoParty.value?.length || folders.value?.length)
);

const { result: showImportButton } = autorun(() => {
  return !Meteor.settings.public?.disallowCreatureApiImport;
});

// The server enforces the role's character limit, this only explains it before
// the user fills in a new character
const characterLimit = computed(() => permissions.value.characterLimit);

const { result: ownedCharacterCount } = autorun(() => {
  return Creatures.find({ owner: Meteor.userId() }).count();
});

function checkCharacterLimit() {
  if (ownedCharacterCount.value < characterLimit.value) return true;
  // An active player is not offered the role they already have
  const message = role.value === ROLES.activePlayer
    ? 'characterList.limitReachedActivePlayer'
    : 'characterList.limitReached';
  snackbar({
    text: t(message, { limit: characterLimit.value }),
  });
  return false;
}

function insertCharacter() {
  if (!checkCharacterLimit()) return;
  dialogStackStore.pushDialogStack({
    component: 'character-creation-dialog',
    elementId: 'new-character-button',
    // Called once the dialog's history entry is gone: going to the new sheet
    // from the dialog itself was undone by that step back. After the browser's
    // own popstate handling, so that it is not undone either
    callback: creatureId => {
      if (creatureId) {
        setTimeout(() => router.push({ name: 'characterSheet', params: { id: creatureId } }));
      }
      return creatureId;
    },
  });
}

function importCharacter() {
  if (!checkCharacterLimit()) return;
  dialogStackStore.pushDialogStack({
    component: 'character-import-dialog',
    elementId: 'import-character-button',
    callback: creatureId => creatureId,
  });
}

async function insertFolder() {
  loadingInsertFolder.value = true;
  try {
    await insertCreatureFolder.callAsync();
  } catch (error) {
    console.error(error);
    snackbar({
      text: error.reason,
    });
  } finally {
    loadingInsertFolder.value = false;
  }
}
</script>
