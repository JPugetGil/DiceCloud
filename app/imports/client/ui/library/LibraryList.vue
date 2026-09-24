<template>
  <v-list
    class="library-list"
  >
    <library-list-tile
      v-for="library in librariesWithoutCollection"
      :key="library._id"
      :model="library"
      :to="{ name: 'singleLibrary', params: { id: library._id }}"
      :selection="selection"
      :single-select="singleSelect"
      :is-selected="librariesSelected && librariesSelected.includes(library._id)"
      :selected-by-collection="librariesSelectedByCollections && librariesSelectedByCollections.includes(library._id)"
      :disabled="disabled"
      @select="val => $emit('select-library', library._id, val)"
    />
    <v-list-group
      v-for="libraryCollection in libraryCollections"
      :key="libraryCollection._id"
      v-model="openCollections[libraryCollection._id]"
      :data-id="`library-collection-${libraryCollection._id}`"
    >
      <template #activator>
        <library-collection-header
          :open="openCollections[libraryCollection._id]"
          :model="libraryCollection"
          :selection="selection"
          :single-select="singleSelect"
          :is-selected="libraryCollectionsSelected && libraryCollectionsSelected.includes(libraryCollection._id)"
          :disabled="disabled"
          @select="val => $emit('select-library-collection', libraryCollection._id, val)"
        />
      </template>
      <library-list-tile
        v-for="library in libraryCollection.libraryDocuments"
        :key="library._id"
        :model="library"
        :to="{ name: 'singleLibrary', params: { id: library._id }}"
        :selection="selection"
        :single-select="singleSelect"
        :is-selected="librariesSelected && librariesSelected.includes(library._id)"
        :selected-by-collection="librariesSelectedByCollections && librariesSelectedByCollections.includes(library._id)"
        :disabled="disabled"
        class="ml-4"
        @select="val => $emit('select-library', library._id, val)"
      />
    </v-list-group>
    <v-list-item v-if="!subLibrariesReady">
      <v-spacer />
      <v-progress-circular
        indeterminate
        color="primary"
      />
      <v-spacer />
    </v-list-item>
  </v-list>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { union } from 'lodash';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import LibraryCollections, { insertLibraryCollection as insertLibraryCollectionApi } from '/imports/api/library/LibraryCollections';
import Libraries, { insertLibrary as insertLibraryApi } from '/imports/api/library/Libraries';
import LibraryListTile from '/imports/client/ui/library/LibraryListTile.vue';
import LibraryCollectionHeader from '/imports/client/ui/library/LibraryCollectionHeader.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

defineProps({
  selection: Boolean,
  singleSelect: Boolean,
  disabled: Boolean,
  librariesSelected: {
    type: Array,
    default: undefined,
  },
  libraryCollectionsSelected: {
    type: Array,
    default: undefined,
  },
  librariesSelectedByCollections: {
    type: Array,
    default: undefined,
  },
});

defineEmits(['select-library', 'select-library-collection']);

const router = useRouter();

const openCollections = ref([]);

const { ready: subLibrariesReady } = subscribe('libraries');

const libraryCollections = autorun(() => {
  const userId = Meteor.userId();
  if (!userId) return;
  const subCollections = Meteor.user()?.subscribedLibraryCollections || [];
  return LibraryCollections.find({
    $or: [
      { owner: userId },
      { writers: userId },
      { readers: userId },
      { _id: { $in: subCollections }, public: true },
    ]
  }, {
    sort: { name: 1 }
  }).map(libCollection => {
    libCollection.libraryDocuments = Libraries.find({
      _id: {$in: libCollection.libraries},
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { public: true },
      ]
    }, {
      sort: { name: 1 }
    }).fetch();
    return libCollection;
  });
}).result;

const librariesWithoutCollection = autorun(() => {
  const userId = Meteor.userId();
  if (!libraryCollections.value) return;
  // Collate the IDs of all the libraries in collections
  let collectedLibraries = [];
  libraryCollections.value.forEach(libCollection => {
    collectedLibraries = union(collectedLibraries, libCollection.libraries);
  });
  // return the libraries with IDs not in that list
  return Libraries.find(
    {
      _id: {$nin: collectedLibraries},
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { public: true },
      ]
    },
    {sort: {name: 1}}
  ).fetch();
}).result;

const insertLibrary = () => {
  dialogStackStore.pushDialogStack({
    component: 'library-creation-dialog',
    elementId: 'insert-library-button',
    async callback(library) {
      if (!library) return;
      try {
        const libraryId = await insertLibraryApi.callAsync(library);
        await router.push({
          name: 'singleLibrary',
          params: { id: libraryId }
        });
        return `library-${libraryId}`;
      } catch (error) {
        console.error(error);
        snackbar({
          text: error.reason,
        });
      }
    }
  });
};

const insertLibraryCollection = () => {
  dialogStackStore.pushDialogStack({
    component: 'library-collection-creation-dialog',
    elementId: 'insert-library-collection-button',
    async callback(libraryCollection) {
      if (!libraryCollection) return;
      try {
        const id = await insertLibraryCollectionApi.callAsync(libraryCollection);
        return `library-collection-${id}`;
      } catch (error) {
        console.error(error);
        snackbar({
          text: error.reason,
        });
      }
    }
  });
};

defineExpose({
  insertLibrary,
  insertLibraryCollection
});
</script>
