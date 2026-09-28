<template>
  <tree-node-list
    v-if="root"
    :children="children"
    :group="group"
    :organize="organize"
    :selected-node="selectedNode"
    :start-expanded="expanded"
    :root="root"
    @selected="e => $emit('selected', e)"
    @move-within-root="moveWithinRoot"
    @move-between-roots="moveBetweenRoots"
  />
</template>

<script setup>
import { filterToForest, getCollectionByName } from '/imports/api/parenting/parentingFunctions';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
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
  group: {
    type: String,
    default: 'creatureProperties'
  },
  collection: {
    type: String,
    default: 'creatureProperties'
  },
  expanded: Boolean,
});

const emit = defineEmits(['selected', 'length']);

const { result: children } = autorun(() => {
  if (!props.root) return [];
  const result = filterToForest?.(
    getCollectionByName(props.collection),
    props.root.id,
    props.filter,
    {
      includeFilteredDocAncestors: true,
      includeFilteredDocDescendants: true,
    }
  ) || [];
  emit('length', result.length);
  return result;
});

async function moveWithinRoot({ doc, newPosition }) {
  try {
    await apiMoveWithinRoot.callAsync({
      docRef: {
        id: doc._id,
        collection: props.collection,
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
        collection: props.collection,
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
