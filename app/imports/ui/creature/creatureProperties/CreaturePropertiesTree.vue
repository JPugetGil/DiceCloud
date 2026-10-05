<template>
  <tree-node-list
    v-if="root"
    :children="children"
    group="creatureProperties"
    :organize="organize"
    :selected-node="selectedNode"
    :root="root"
    @selected="e => $emit('selected', e)"
    @move-within-root="moveWithinRoot"
    @move-between-roots="moveBetweenRoots"
  />
</template>

<script setup>
import { filterToForest, getCollectionByName } from '/imports/api/parenting/parentingFunctions';
import TreeNodeList from '/imports/ui/components/tree/TreeNodeList.vue';
import { moveBetweenRoots as apiMoveBetweenRoots, moveWithinRoot as apiMoveWithinRoot } from '/imports/api/parenting/organizeMethods';
import { autorun } from 'vue-meteor-tracker';

const props = defineProps({
  root: {
    type: Object,
    default: undefined,
  },
  organize: Boolean,
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

const collection = 'creatureProperties';

const { result: children } = autorun(() => {
  if (!props.root) return [];
  return filterToForest?.(
    getCollectionByName(collection),
    props.root.id,
    props.filter,
    {
      includeFilteredDocAncestors: true,
      includeFilteredDocDescendants: true,
    }
  ) || [];
});

async function moveWithinRoot({ doc, newPosition }) {
  try {
    await apiMoveWithinRoot.callAsync({
      docRef: {
        id: doc._id,
        collection,
      },
      newPosition,
    });
  } catch (error) {
    console.error(error);
  }
}

async function moveBetweenRoots({ doc, newPosition, newRootRef }) {
  try {
    await apiMoveBetweenRoots.callAsync({
      docRef: {
        id: doc._id,
        collection,
      },
      newPosition,
      newRootRef,
    });
  } catch (error) {
    console.error(error);
  }
}
</script>

<style lang="css" scoped>

</style>
