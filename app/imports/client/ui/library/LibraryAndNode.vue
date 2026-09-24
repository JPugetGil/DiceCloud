<template>
  <tree-detail-layout>
    <template
      v-if="showSecondTree"
      #left-tree
    >
      <library-second-tree
        :selected-node="selectedNode"
        @close="showSecondTree = false"
        @selected="clickNode"
      />
    </template>
    <template #tree>
      <div

        class="d-flex flex-1-1 flex-column"
        style="
        background-color: inherit;
        width: initial;
        max-width: 100%;
        min-width: 320px;
        height: 100%;
      "
      >
        <v-toolbar
          flat
          class="tree-toolbar"
          :color="selectedNode && selectedNode.color || 'secondary'"
          :theme="isToolbarDark ? 'dark' : 'light'"
        >
          <tree-search-input
            ref="searchBox"
            v-model="filter"
            class="mx-4"
            :is-library="true"
            @extra-fields-changed="val => extraFields = val"
          />
          <v-spacer />
          <v-fade-transition>
            <v-menu v-if="organize && mdAndUp">
              <template #activator="{ props: menuProps }">
                <v-btn
                  variant="text"
                  icon

                  v-bind="menuProps"
                >
                  <v-icon>mdi-dots-vertical</v-icon>
                </v-btn>
              </template>
              <v-card>
                <v-card-text>
                  <v-switch
                    v-model="showSecondTree"
                    label="Show second library tree"
                  />
                </v-card-text>
              </v-card>
            </v-menu>
          </v-fade-transition>
          <v-switch
            v-if="!libraryId || canEditLibrary"
            v-model="organize"
            hide-details
            density="compact"
            label="Organize"
            class="ml-1 mr-3"
            style="flex-grow: 0;"
          />
          <insert-library-node-button
            v-if="libraryId && canEditLibrary"
            style="bottom: -24px"
            fab
            :library-id="libraryId"
            :selected-node-id="selectedNodeId"
            @selected="id => {if (mdAndUp) selectedNodeId = id}"
          />
        </v-toolbar>
        <div
          v-if="libraryId"
          style="width: 100%; height: 100%; overflow: auto; padding: 12px;"
        >
          <library-contents-container
            :library-id="libraryId"
            :organize-mode="organize"
            :selected-node="selectedNode"
            :extra-fields="extraFields"
            should-subscribe
            :filter="filter"
            @selected="clickNode"
          />
        </div>
        <library-browser
          v-else
          edit-mode
          :organize-mode="organize"
          :selected-node="selectedNode"
          style="overflow-y: auto; padding: 12px;"
          :filter="filter"
          @selected="clickNode"
        />
      </div>
    </template>
    <template #detail>
      <div

        data-id="selected-node-card"
        style="overflow: hidden; min-height: 100%;"
      >
        <library-node-dialog
          :_id="selectedNodeId"
          embedded
          @removed="selectedNodeId = undefined"
          @duplicated="id => {if (mdAndUp) selectedNodeId = id}"
          @select-sub-property="id => selectedNodeId = id"
        />
      </div>
    </template>
  </tree-detail-layout>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import TreeDetailLayout from '/imports/client/ui/components/TreeDetailLayout.vue';
import LibraryBrowser from '/imports/client/ui/library/LibraryBrowser.vue';
import LibraryNodeDialog from '/imports/client/ui/library/LibraryNodeDialog.vue';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import Libraries from '/imports/api/library/Libraries';
import LibraryContentsContainer from '/imports/client/ui/library/LibraryContentsContainer.vue';
import InsertLibraryNodeButton from '/imports/client/ui/library/InsertLibraryNodeButton.vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';

import getThemeColor from '/imports/client/ui/utility/getThemeColor';
import TreeSearchInput from '/imports/client/ui/components/tree/TreeSearchInput.vue';
import LibrarySecondTree from '/imports/client/ui/library/LibrarySecondTree.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  selection: Boolean,
  libraryId: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['selected']);

const { mdAndUp } = useDisplay();

const organize = ref(false);
const selectedNodeId = ref(undefined);
const filter = ref(undefined);
const extraFields = ref([]);
const showSecondTree = ref(false);

const searchBox = ref(null);

subscribe(() => {
  if (props.libraryId) {
    return ['library', props.libraryId];
  } else {
    return false;
  }
});


const library = autorun(() => {
  let libraryId = props.libraryId;
  if (!libraryId) return;
  return Libraries.findOne(libraryId);
}).result;

const canEditLibrary = autorun(() => {
  if (!props.libraryId) return;
  return hasEditPermission(library.value, Meteor.user());
}).result;

const selectedNode = autorun(() => {
  return LibraryNodes.findOne({
    _id: selectedNodeId.value,
    removed: { $ne: true }
  });
}).result;

const isToolbarDark = computed(() => {
  return isDarkColor(
    (selectedNode.value && selectedNode.value.color) ||
    getThemeColor('secondary')
  );
});

watch(selectedNode, (val) => {
  emit('selected', val);
});


function clickNode(id) {
  if (mdAndUp.value) {
    selectedNodeId.value = id;
  } else {
    dialogStackStore.pushDialogStack({
      component: 'library-node-dialog',
      elementId: `tree-node-${id}`,
      data: {
        _id: id,
        selection: props.selection,
      },
      callback: result => {
        if (result) {
          selectedNodeId.value = id;
        }
      },
    });
  }
}
</script>

<style lang="css" scoped>
/*
 * The insert button hangs half over the toolbar's bottom edge, as in Vue 2.
 * Vuetify 3 clips toolbar content; Vuetify 2 did not.
 */
.tree-toolbar :deep(.v-toolbar__content) {
  overflow: visible;
}
</style>
