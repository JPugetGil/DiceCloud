<template>
  <div
    class="card-background"
    style="height: 100%"
  >
    <v-container>
      <v-row justify="center">
        <v-col
          cols="12"
          xl="8"
        >
          <v-card :class="{'mb-4': libraryCollections && libraryCollections.length}">
            <v-fade-transition
              hide-on-leave
              leave-absolute
            >
              <v-row
                v-if="!librariesReady"
                align="center"
                justify="center"
                class="pa-4"
              >
                <v-progress-circular
                  indeterminate
                  color="primary"
                  size="32"
                />
              </v-row>
              <library-list v-else />
            </v-fade-transition>
          </v-card>
          <div class="d-flex flex-1-1 flex-wrap justify-end mt-2">
            <v-btn
              variant="text"
              to="/community-libraries"
            >
              {{ $t('library.browseCommunity') }}
            </v-btn>
            <v-btn
              variant="text"
              data-id="insert-library-collection-button"
              color="accent"
              :loading="loadingInsertLibraryCollection"
              @click="insertLibraryCollectionDialog"
            >
              {{ $t('library.addCollection') }}
            </v-btn>
          </div>
          <v-btn
            color="accent"
            icon
            position="fixed"
            class="ma-4"
            location="bottom right"

            data-id="insert-library-button"
            @click="insertLibraryDialog"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import LibraryCollections, { insertLibraryCollection } from '/imports/api/library/LibraryCollections';
import Libraries, { insertLibrary } from '/imports/api/library/Libraries';
import LibraryList from '/imports/client/ui/library/LibraryList.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const router = useRouter();

const loadingInsertLibraryCollection = ref(false);

const { ready: librariesReady } = subscribe('libraries');

const libraryCollections = autorun(() => {
  const userId = Meteor.userId();
  if (!userId) return;
  const subCollections = Meteor.user().subscribedLibraryCollections || [];
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


function insertLibraryDialog() {
  dialogStackStore.pushDialogStack({
    component: 'library-creation-dialog',
    elementId: 'insert-library-button',
    async callback(library){
      if (!library) return;
      try {
        const libraryId = await insertLibrary.callAsync(library);
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
}

function insertLibraryCollectionDialog() {
  dialogStackStore.pushDialogStack({
    component: 'library-collection-creation-dialog',
    elementId: 'insert-library-collection-button',
    async callback(libraryCollection){
      if (!libraryCollection) return;
      try {
        const id = await insertLibraryCollection.callAsync(libraryCollection);
        return `library-collection-${id}`;
      } catch (error) {
        console.error(error);
        snackbar({
          text: error.reason,
        });
      }
    }
  });
}
</script>
