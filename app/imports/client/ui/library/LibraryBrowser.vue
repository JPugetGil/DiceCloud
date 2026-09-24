<template>
  <div
    class="library-browser"
    style="
      background-color: inherit;
      overflow-y: auto;
    "
  >
    <v-expansion-panels
      v-model="expandedLibrary"
      accordian
      flat
      multiple
    >
      <v-expansion-panel
        v-for="library in libraries"
        :key="library._id"
        :data-id="library._id"
      >
        <v-expansion-panel-title>
          <div class="text-h6">
            {{ library.name }}
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-1-1 justify-space-around ma-2">
            <insert-library-node-button
              v-if="editPermission(library)"
              :library-id="library._id"
              :selected-node-id="selectedNode && selectedNode._id"
              @selected="e => $emit('selected', e)"
            />
            <v-btn
              color="primary"
              variant="outlined"
              size="small"
              @click="router.push(`/library/${library._id}`)"
            >
              <v-icon>mdi-arrow-right</v-icon>
            </v-btn>
          </div>
          <library-contents-container
            :library-id="library._id"
            :organize-mode="organizeMode && editPermission(library)"
            :edit-mode="editMode"
            :selected-node="selectedNode"
            :filter="filter"
            should-subscribe
            @selected="e => $emit('selected', e)"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-btn
      v-show="noLibrariesExpanded"
      v-if="editMode"
      variant="text"
      color="primary"
      style="background-color: inherit;"
      data-id="insert-library-button"
      @click="insertLibrary"
    >
      <v-icon>mdi-plus</v-icon>
      New library
    </v-btn>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import LibraryContentsContainer from '/imports/client/ui/library/LibraryContentsContainer.vue';
import Libraries, { insertLibrary as insertLibraryMethod } from '/imports/api/library/Libraries';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import InsertLibraryNodeButton from '/imports/client/ui/library/InsertLibraryNodeButton.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

defineProps({
  organizeMode: Boolean,
  editMode: Boolean,
  selectedNode: {
    type: Object,
    default: undefined,
  },
  filter: {
    type: Object,
    default: undefined,
  },
});

defineEmits(['selected']);

const router = useRouter();

const expandedLibrary = ref([]);

const noLibrariesExpanded = computed(() => {
  return !expandedLibrary.value || expandedLibrary.value.length === 0;
});

subscribe('libraries');

const libraries = autorun(() => {
  return Libraries.find({}, {
    sort: { name: 1 }
  }).fetch();
}).result;

function insertLibrary() {
  dialogStackStore.pushDialogStack({
    component: 'library-creation-dialog',
    elementId: 'insert-library-button',
    async callback(library) {
      if (!library) return;
      let libraryId = await insertLibraryMethod.callAsync(library);
      return libraryId;
    }
  });
}

function editPermission(library) {
  // Called from the template, so it has to answer synchronously
  return hasEditPermission(library, Meteor.user());
}

</script>

<style lang="css">
.library-browser .v-expansion-panel-text__wrapper, .library-browser .v-expansion-panel-title {
  padding: 0 !important;
}
</style>
