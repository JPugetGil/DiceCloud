<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ mode === 'archive' ? 'Archive' : 'Restore' }}
      </v-toolbar-title>
      <v-spacer />
      <v-btn-toggle
        v-model="mode"
        mandatory
      >
        <v-btn value="archive">
          <span>Archive</span>
          <v-icon end>
            mdi-archive-arrow-down
          </v-icon>
        </v-btn>
        <v-btn value="restore">
          <span>Restore</span>
          <v-icon end>
            mdi-archive-arrow-up-outline
          </v-icon>
        </v-btn>
      </v-btn-toggle>
    </template>
    <creature-folder-list
      selection
      :creatures="mode === 'archive' ? CreaturesWithNoParty : archiveCreaturesWithNoParty"
      :folders="mode === 'archive' ? folders : archivefolders"
      :selected-creature="selectedCreature"
      @creature-selected="id => selectedCreature = id"
    />
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        :loading="archiveActionLoading"
        :disabled="!numSelected"
        color="primary"
        @click="archiveAction"
      >
        {{ mode === 'archive' ? 'Archive' : 'Restore' }}
      </v-btn>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        Close
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureFolderList from '/imports/client/ui/creature/creatureList/CreatureFolderList.vue';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import archiveCreatureToFile from '/imports/api/creature/archive/methods/archiveCreatureToFile';
import restoreCreatureFromFile from '/imports/api/creature/archive/methods/restoreCreatureFromFile';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { uniq, flatten } from 'lodash';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();


const characterTransform = function(char){
  char.url = `/character/${char._id}/${char.urlName || '-'}`;
  char.initial = char.name && char.name[0] || '?';
  return char;
};

const fileTransform = function(file){
  return {
    _id: file._id,
    name: file.meta.creatureName,
    owner: file.userId,
    creatureId: file.meta.creatureId,
  };
}

const creatureFields = {
  'color': 1,
  'avatarPicture': 1,
  'name': 1,
  'initial': 1,
  'alignment': 1,
  'gender': 1,
  'race': 1,
  'readers': 1,
  'writers': 1,
  'owner': 1,
};

const selectedCreature = ref(null);
const mode = ref('archive');
const archiveActionLoading = ref(false);

const numSelected = computed(() => {
  return selectedCreature.value ? 1 : 0;
});

watch(mode, () => {
  selectedCreature.value = null;
});

const archiveAction = async () => {
  if (!selectedCreature.value) return;
  archiveActionLoading.value = true;
  try {
    if (mode.value === 'archive'){
      await archiveCreatureToFile.callAsync({
        creatureId: selectedCreature.value,
      });
    } else if (mode.value === 'restore'){
      await restoreCreatureFromFile.callAsync({
        fileId: selectedCreature.value,
      });
    }
    selectedCreature.value = null;
  } catch (error) {
    console.error(error);
    snackbar({text: error.reason});
  } finally {
    archiveActionLoading.value = false;
  }
};

subscribe('archivedCreatures');
subscribe('archiveCreatureFiles');
subscribe('characterList');

const folders = autorun(() => {
  const userId = Meteor.userId();
  let foldersResult = CreatureFolders.find(
    {owner: userId, archived: {$ne: true}},
    {sort: {left: 1}},
  ).map(folder => {
    folder.creatures = Creatures.find(
      {
        _id: {$in: folder.creatures || []},
        owner: userId,
      }, {
        sort: {name: 1},
        fields: creatureFields,
      }
    ).map(characterTransform);
    return folder;
  });
  foldersResult = foldersResult.filter(folder => !!folder.creatures.length);
  return foldersResult;
}).result;

const CreaturesWithNoParty = autorun(() => {
  const userId = Meteor.userId();
  const charArrays = CreatureFolders.find({owner: userId}).map(p => p.creatures);
  const folderChars = uniq(flatten(charArrays));
  return Creatures.find(
    {
      _id: {$nin: folderChars},
      owner: userId,
    }, {
      sort: {name: 1},
      fields: creatureFields,
    }
  ).map(characterTransform);
}).result;

const archivefolders = autorun(() => {
  const userId = Meteor.userId();
  let foldersResult = CreatureFolders.find(
    {owner: userId},
    {sort: {left: 1}},
  ).map(folder => {
    folder.creatures = ArchiveCreatureFiles.find(
      {
        'meta.creatureId': {$in: folder.creatures || []},
        userId,
      }, {
        sort: {'meta.creatureName': 1},
      }
    ).map(fileTransform);
    return folder;
  });
  foldersResult = foldersResult.filter(folder => !!folder.creatures.length);
  return foldersResult;
}).result;

const archiveCreaturesWithNoParty = autorun(() => {
  const userId = Meteor.userId();
  const charArrays = CreatureFolders.find({owner: userId}).map(p => p.creatures);
  const folderChars = uniq(flatten(charArrays));
  return ArchiveCreatureFiles.find(
    {
      'meta.creatureId': {$nin: folderChars},
      userId,
    }, {
      sort: {'meta.creatureName': 1},
    }
  ).map(fileTransform);
}).result;
</script>

<style lang="css" scoped>
</style>
