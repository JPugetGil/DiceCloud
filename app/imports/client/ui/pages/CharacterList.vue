<template>
  <div
    class="card-background"
    style="height: 100%"
  >
    <v-container>
      <v-row
        justify="center"
        class="mb-16"
      >
        <v-col
          cols="12"
          xl="8"
        >
          <v-card :class="{ 'mb-4': folders && folders.length }">
            <creature-folder-list
              :creatures="CreaturesWithNoParty"
              :folders="folders"
            />
          </v-card>
          <div class="d-flex flex-1-1 justify-end mt-2">
            <v-btn
              v-if="showImportButton"
              variant="text"
              data-id="import-character-button"
              @click="importCharacter"
            >
              {{ $t('characterList.importCharacter') }}
            </v-btn>
            <v-btn
              variant="text"
              :loading="loadingInsertFolder"
              @click="insertFolder"
            >
              {{ $t('characterList.addFolder') }}
            </v-btn>
          </div>
          <v-btn
            color="accent"
            icon
            position="fixed"
            class="ma-4"
            location="bottom right"

            data-id="new-character-button"
            @click="insertCharacter"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="js">
import { ref } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import insertCreatureFolder from '/imports/api/creature/creatureFolders/methods.js/insertCreatureFolder';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import CreatureFolderList from '/imports/client/ui/creature/creatureList/CreatureFolderList.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { uniq, flatten } from 'lodash';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();


const characterTransform = function (char) {
  char.url = `/character/${char._id}/${getCreatureUrlName(char)}`;
  char.initial = char.name && char.name[0] || '?';
  return char;
};

const loadingInsertFolder = ref(false);

subscribe('characterList');

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

const { result: showImportButton } = autorun(() => {
  return !Meteor.settings.public?.disallowCreatureApiImport;
});

function insertCharacter() {
  dialogStackStore.pushDialogStack({
    component: 'character-creation-dialog',
    elementId: 'new-character-button',
    callback: creatureId => creatureId,
  });
}

function importCharacter() {
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
