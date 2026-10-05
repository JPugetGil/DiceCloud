<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <v-container :class="{ 'fab-clearance': permissions.canCreateLibraries }">
      <v-row class="justify-center">
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
                class="pa-4 align-center justify-center"
              >
                <v-progress-circular
                  indeterminate
                  color="primary"
                  size="32"
                />
              </v-row>
              <!-- A new account follows no library: say where they are -->
              <v-empty-state
                v-else-if="noLibraries"
                icon="mdi-library-shelves"
                :title="$t('library.emptyTitle')"
                :text="$t('library.emptyText')"
                data-id="library-empty"
              >
                <template #actions>
                  <v-btn
                    color="primary"
                    variant="flat"
                    prepend-icon="mdi-earth"
                    to="/community-libraries"
                  >
                    {{ $t('library.browseCommunity') }}
                  </v-btn>
                </template>
              </v-empty-state>
              <library-list v-else />
            </v-fade-transition>
          </v-card>
          <div class="d-flex flex-1-1 flex-wrap justify-end mt-2">
            <v-btn
              v-if="!noLibraries"
              variant="text"
              prepend-icon="mdi-earth"
              to="/community-libraries"
            >
              {{ $t('library.browseCommunity') }}
            </v-btn>
            <v-btn
              v-if="permissions.canCreateLibraries"
              variant="text"
              prepend-icon="mdi-file-upload-outline"
              data-id="import-libraries-button"
              @click="importLibrariesDialog"
            >
              {{ $t('libraryFiles.importTitle') }}
            </v-btn>
            <v-btn
              v-if="permissions.canCreateLibraries"
              variant="text"
              prepend-icon="mdi-folder-plus-outline"
              data-id="insert-library-collection-button"
              color="accent"
              :loading="loadingInsertLibraryCollection"
              @click="insertLibraryCollectionDialog"
            >
              {{ $t('library.addCollection') }}
            </v-btn>
          </div>
          <v-btn
            v-if="permissions.canCreateLibraries"
            color="accent"
            icon
            position="fixed"
            class="ma-4"
            location="bottom right"

            data-id="insert-library-button"
            :aria-label="$t('library.newLibrary')"
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
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import LibraryCollections, { insertLibraryCollection } from '/imports/api/library/LibraryCollections';
import Libraries, { insertLibrary } from '/imports/api/library/Libraries';
import LibraryList from '/imports/ui/library/LibraryList.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useUserRole from '/imports/ui/composables/useUserRole';
import { Meteor } from 'meteor/meteor';

const dialogStackStore = useDialogStackStore();

const router = useRouter();

// Players can subscribe to libraries, but not create them
const { permissions } = useUserRole();

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


// No library or collection subscribed to, owned or shared
const noLibraries = autorun(() => {
  const user = Meteor.user();
  if (!user) return false;
  const mine = { $or: [{ owner: user._id }, { writers: user._id }, { readers: user._id }] };
  return !user.subscribedLibraries?.length && !user.subscribedLibraryCollections?.length
    && !Libraries.find(mine).count() && !LibraryCollections.find(mine).count();
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

function importLibrariesDialog() {
  dialogStackStore.pushDialogStack({
    component: 'library-import-dialog',
    elementId: 'import-libraries-button',
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
