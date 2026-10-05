<template>
  <v-list
    v-model:opened="openCollections"
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
      :value="libraryCollection._id"
      :raw-id="`${listId}-${libraryCollection._id}`"
      :data-id="`library-collection-${libraryCollection._id}`"
    >
      <template #activator="{ props: activatorProps }">
        <library-collection-header
          v-bind="activatorProps"
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
import { ref, useId } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { union } from 'lodash';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import LibraryListTile from '/imports/ui/library/LibraryListTile.vue';
import LibraryCollectionHeader from '/imports/ui/library/LibraryCollectionHeader.vue';
import { Meteor } from 'meteor/meteor';

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

// Ids of the open collections: Vuetify keeps a group's open state on its list
const openCollections = ref([]);
// Pages can show more than one library list: keep their element ids apart
const listId = useId();

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
</script>
