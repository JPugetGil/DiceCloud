<template>
  <tree-node-list
    v-if="model && model.root"
    :children="children"
    :group="group"
    :organize="organize"
    :start-expanded="expanded"
    :root="model.root"
    @selected="e => $emit('selected', e)"
    @move-within-root="moveWithinRoot"
    @move-between-roots="moveBetweenRoots"
  />
</template>

<script setup lang="js">
import { autorun } from 'vue-meteor-tracker';
import { docsToForest, getFilter, getCollectionByName } from '/imports/api/parenting/parentingFunctions';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
import { moveBetweenRoots as moveBetweenRootsMethod, moveWithinRoot as moveWithinRootMethod } from '/imports/api/parenting/organizeMethods';

const props = defineProps({
  // The document for which we are finding children
  model: {
    type: Object,
    default: undefined,
  },
  organize: Boolean,
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
  if (!props.model?.root) return [];
  const collection = getCollectionByName(props.collection);
  const docs = collection.find({
    removed: { $ne: true },
    ...getFilter.descendants(props.model),
  }, {
    sort: { left: 1 }
  }).fetch();
  emit('length', docs.length);

  return docsToForest(docs);
});

async function moveWithinRoot({ doc, newPosition }) {
  try {
    await moveWithinRootMethod.callAsync({
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
    await moveBetweenRootsMethod.callAsync({
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
