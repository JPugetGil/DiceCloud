<template>
  <div :key="id">
    <v-progress-linear
      v-if="!subsReady"
      indeterminate
      color="accent"
    />
    <v-expand-transition>
      <div
        v-if="subsReady"
        class="pt-4"
      >
        <component
          :is="model?.type"
          :model="model"
          class="property-viewer"
        />
        <tree-node-list
          group="library-node-expansion"
          :root="{collection: 'libraryNodes', id: id}"
          :children="propertyChildren"
          @selected="clickChild"
        />
      </div>
    </v-expand-transition>
  </div>
</template>

<script lang="js">
import propertyViewerIndex from '/imports/client/ui/properties/viewers/shared/propertyViewerIndex';

export default {
  components: {
    ...propertyViewerIndex,
  },
};
</script>

<script setup lang="js">
import { computed } from 'vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { docsToForest, getFilter } from '/imports/api/parenting/parentingFunctions';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const dialogStackStore = useDialogStackStore();

const { ready: libraryNodeReady } = subscribe(() => ['libraryNode', props.id]);
const { ready: descendantLibraryNodesReady } = subscribe(() => ['descendantLibraryNodes', props.id]);

const subsReady = computed(() => libraryNodeReady.value && descendantLibraryNodesReady.value);

const model = autorun(() => LibraryNodes.findOne(props.id)).result;

const propertyChildren = autorun(() => {
  if (!model.value) return [];
  const descendants = LibraryNodes.find({
    ...getFilter.descendants(model.value),
    removed: { $ne: true },
  }).fetch();
  return docsToForest(descendants);
}).result;

function clickChild(childId) {
  dialogStackStore.pushDialogStack({
    component: 'library-node-dialog',
    elementId: `tree-node-${childId}`,
    data: {
      _id: childId,
    },
  });
}
</script>

<style lang="css" scoped>
</style>
