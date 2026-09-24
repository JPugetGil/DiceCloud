<template>
  <!--use value for immutable, list for auto-updating children -->
  <draggable
    v-model="displayedChildren"
    class="drag-area"
    :group="group"
    :animation="200"
    ghost-class="ghost"
    draggable=".item"
    handle=".handle"
    :item-key="child => child.doc._id"
    @change="change"
  >
    <template #item="{ element: child }">
      <tree-node
        class="item"
        :node="child.doc"
        :children="child.children"
        :group="group"
        :selected-node="selectedNode"
        :selected="selectedNode && selectedNode._id === child.doc._id"
        :ancestors-of-selected-node="ancestorsOfSelectedNode"
        :organize="organize"
        :lazy="lazy"
        :start-expanded="startExpanded"
        @selected="e => $emit('selected', e)"
        @move-within-root="e => $emit('move-within-root', e)"
        @move-between-roots="e => $emit('move-between-roots', e)"
      />
    </template>
  </draggable>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import draggable from 'vuedraggable';
import TreeNode from '/imports/client/ui/components/tree/TreeNode.vue';

const props = defineProps({
  node: {
    type: Object,
    default: undefined,
  },
  root: {
    type: Object,
    required: true,
  },
  group: {
    type: String,
    default: undefined,
  },
  organize: Boolean,
  lazy: Boolean,
  children: {
    type: Array,
    default: () => [],
  },
  selectedNode: {
    type: Object,
    default: undefined,
  },
  ancestorsOfSelectedNode: {
    type: Array,
    default: () => [],
  },
  startExpanded: Boolean,
});

const emit = defineEmits(['selected', 'move-within-root', 'move-between-roots']);

const displayedChildren = ref([]);


watch(
  () => props.children,
  (value) => {
    displayedChildren.value = value;
  }
);

onMounted(() => {
  displayedChildren.value = props.children;
});

function change({ added, moved }) {
  let event = moved || added;
  if (event) {
    let doc = event.element.doc;
    let newPosition;
    if (!props.children.length) {
      if (props.node) {
        newPosition = props.node.left + 0.5;
      } else {
        newPosition = 0.5;
      }
    } else if (event.newIndex < props.children.length) {
      let childAtNewIndex = props.children[event.newIndex];
      if (event.newIndex > event.oldIndex) {
        newPosition = childAtNewIndex.doc.right + 0.5;
      } else {
        newPosition = childAtNewIndex.doc.left - 0.5;
      }
    } else {
      let childBeforeNewIndex = props.children[event.newIndex - 1];
      newPosition = childBeforeNewIndex.doc.right + 0.5;
    }
    if (doc.root.id === props.root.id) {
      emit('move-within-root', { doc, newPosition });
    } else {
      emit('move-between-roots', { doc, newPosition, newRootRef: props.root });
    }
  }
}
</script>

<style lang="css" scoped>
.flip-list-leave-active {
  display: none;
}

.flip-list-move {
  transition: transform 0.5s;
}

.no-move {
  transition: transform 0s;
}
</style>
