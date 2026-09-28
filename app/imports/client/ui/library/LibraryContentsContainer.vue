<template>
  <v-fade-transition hide-on-leave>
    <tree-node-list
      v-if="slowShouldSubscribe && libraryNodesSubReady"
      group="library"
      :children="libraryChildren"
      :organize="organizeMode"
      :selected-node="selectedNode"
      :root="{collection: 'libraries', id: libraryId}"
      @selected="e => $emit('selected', e)"
      @move-within-root="handleMoveWithinRoot"
      @move-between-roots="handleMoveBetweenRoots"
    />
    <div
      v-else
      class="d-flex flex-1-1 align-center justify-center"
      style="width: 100%;"
    >
      <v-progress-circular
        color="primary"
        :indeterminate="slowShouldSubscribe"
      />
    </div>
  </v-fade-transition>
</template>

<script setup>
import { ref, watch } from 'vue';
import { subscribe, autorun } from 'vue-meteor-tracker';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { filterToForest } from '/imports/api/parenting/parentingFunctions';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
import { moveBetweenRoots, moveWithinRoot } from '/imports/api/parenting/organizeMethods';

const props = defineProps({
  libraryId: {
    type: String,
    default: undefined,
  },
  organizeMode: Boolean,
  selectedNode: {
    type: Object,
    default: undefined,
  },
  shouldSubscribe: Boolean,
  filter: {
    type: Object,
    default: undefined,
  },
  extraFields: {
    type: Array,
    default: undefined,
  },
});

defineEmits(['selected']);

const slowShouldSubscribe = ref(props.shouldSubscribe);
let timeoutId = null;

watch(() => props.shouldSubscribe, (newValue) => {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (newValue) {
    slowShouldSubscribe.value = newValue;
  } else {
    timeoutId = setTimeout(() => {
      slowShouldSubscribe.value = newValue;
    }, 2000);
  }
});

const { ready: libraryNodesSubReady } = subscribe(() => {
  if (slowShouldSubscribe.value) {
    return ['libraryNodes', props.libraryId, props.extraFields];
  }
  return false;
});

const library = autorun(() => Libraries.findOne(props.libraryId)).result;

const libraryChildren = autorun(() => {
  if (!library.value) return;
  return filterToForest(
    LibraryNodes,
    props.libraryId,
    props.filter,
    {
      includeFilteredDocAncestors: true,
      includeFilteredDocDescendants: true,
    }
  );
}).result;

async function handleMoveWithinRoot({ doc, newPosition }) {
  try {
    await moveWithinRoot.callAsync({
      docRef: {
        id: doc._id,
        collection: 'libraryNodes',
      },
      newPosition,
    });
  } catch (error) {
    console.error(error);
  }
}

async function handleMoveBetweenRoots({ doc, newPosition, newRootRef }) {
  try {
    await moveBetweenRoots.callAsync({
      docRef: {
        id: doc._id,
        collection: 'libraryNodes',
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
