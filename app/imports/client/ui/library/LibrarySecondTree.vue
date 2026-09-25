<template>
  <div class="d-flex flex-column fill-height">
    <v-fade-transition mode="out-in">
      <v-toolbar
        v-if="libraryId"
        theme="dark"
        flat
        color="secondary"
      >
        <v-btn
          variant="text"
          icon
          @click="libraryId = undefined"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title
          key="library-name"
          class="d-flex"
        >
          <div class="flex-shrink-1">
            {{ library && library.name }}
          </div>
          <v-spacer />
        </v-toolbar-title>
        <v-btn
          v-if="library && (route.params.id !== library._id)"
          variant="text"
          icon
          @click="libraryId = undefined; router.push({ name: 'singleLibrary', params: { id: library._id }})"
        >
          <v-icon>mdi-arrow-right-bold</v-icon>
        </v-btn>
      </v-toolbar>
      <v-toolbar
        v-else
        theme="dark"
        flat
        color="secondary"
      >
        <v-toolbar-title
          key="no-library"
        >
          <v-btn
            variant="text"
            icon
            @click="$emit('close')"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
          {{ $t('library.selectLibrary') }}
        </v-toolbar-title>
      </v-toolbar>
    </v-fade-transition>
    <v-sheet
      class="pa-3 flex-grow-1 flex-shrink-1"
      style="overflow: auto;"
    >
      <v-fade-transition mode="out-in">
        <library-list
          v-if="!libraryId"
          selection
          single-select
          @select-library="id => libraryId = id"
        />
        <library-contents-container
          v-else
          :library-id="libraryId"
          :organize-mode="canEditLibrary"
          should-subscribe
          :selected-node="selectedNode"
          @selected="e => $emit('selected', e)"
        />
      </v-fade-transition>
    </v-sheet>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import LibraryList from '/imports/client/ui/library/LibraryList.vue';
import LibraryContentsContainer from '/imports/client/ui/library/LibraryContentsContainer.vue';
import Libraries from '/imports/api/library/Libraries';

defineProps({
  selectedNode: {
    type: Object,
    default: undefined,
  },
});

defineEmits(['close', 'selected']);

const route = useRoute();
const router = useRouter();

const libraryId = ref(undefined);

subscribe(() => {
  if (libraryId.value) {
    return ['library', libraryId.value];
  } else {
    return false;
  }
});

const library = autorun(() => Libraries.findOne(libraryId.value)).result;

const canEditLibrary = autorun(() => {
  if (!libraryId.value) return;
  return hasEditPermission(library.value, Meteor.user());
}).result;
</script>

<style lang="css" scoped>
</style>
