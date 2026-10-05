<template>
  <v-container class="pa-6">
    <v-row
      v-if="collection && collection.description"
      class="justify-center align-stretch"
    >
      <v-col
        cols="12"
      >
        <v-card>
          <v-card-text>
            <markdown-text :markdown="collection.description" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-row
      class="align-stretch"
    >
      <v-col
        v-for="library in libraries"
        :key="library._id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
      >
        <v-card
          style="height: 100%;"
          :to="{name: 'singleLibrary', params: {id: library._id}}"
        >
          <v-card-title>
            {{ library.name }}
          </v-card-title>
          <v-card-text>
            <markdown-text :markdown="library.description" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row> 
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';

const route = useRoute();

// Through a computed, which only changes with the id: closing a dialog gives
// the route new params, and the subscription started again
const collectionId = computed(() => route.params.id);
subscribe(() => ['libraryCollection', collectionId.value]);

const collection = autorun(() => LibraryCollections.findOne(route.params.id)).result;

// In the collection's own order, which its owner chose: the database's would
// be arbitrary
const libraries = autorun(() => {
  if (!collection.value) return;
  const ids = collection.value.libraries;
  return Libraries.find({
    _id: { $in: ids },
  }).fetch().sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id));
}).result;
</script>
