<template>
  <v-btn
    :icon="fab"
    :variant="fab ? 'elevated' : 'outlined'"
    size="small"
    color="primary"
    data-id="insert-library-node-button"
    @click="insertLibraryNode"
  >
    <v-icon>mdi-plus</v-icon>
    <slot />
  </v-btn>
</template>

<script setup>
import { insertNode } from '/imports/api/library/LibraryNodes';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  libraryId: {
    type: String,
    required: true,
  },
  selectedNodeId: {
    type: String,
    default: undefined,
  },
  fab: Boolean,
});

const emit = defineEmits(['selected']);

const dialogStackStore = useDialogStackStore();

function insertLibraryNode() {
  let libraryId = props.libraryId;

  // Get ancestry reference
  const parentRef = {
    id: libraryId,
    collection: 'libraries',
  };

  // Insert form dialog
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId: 'insert-library-node-button',
    data: {
      hideLibraryTab: true,
      noBackdropClose: true,
      showLibraryOnlyProps: true,
      collection: 'libraryNodes',
    },
    async callback(libraryNode){
      if (!libraryNode) return;

      // Set order to first
      libraryNode.order = -1;

      // Insert doc
      let libraryNodeId = await insertNode.callAsync({ libraryNode, parentRef });
      emit('selected', libraryNodeId);
      return `tree-node-${libraryNodeId}`;
    }
  });
}
</script>

<style lang="css" scoped>
</style>
