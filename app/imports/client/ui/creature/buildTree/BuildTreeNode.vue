<template>
  <v-sheet
    class="tree-node"
    :class="{
      'empty': !hasChildren,
    }"
    :data-id="`tree-node-${doc._id}`"
  >
    <div
      class="d-flex flex-1-1 align-center justify-start tree-node-title"
      style="cursor: pointer;"
      @click.stop="$emit('selected', doc._id)"
    >
      <v-btn
        variant="text"
        size="small"
        icon
        class="expand-button"
        :class="{
          'rotate-90': showExpanded,
          'text-accent': doc._descendantCanFill || canFillWithMany
        }"
        :disabled="!canExpand"
        @click.stop="expanded = !expanded"
      >
        <v-icon v-if="canExpand">
          mdi-chevron-right
        </v-icon>
      </v-btn>
      <div
        class="d-flex flex-1-1 align-center justify-start pr-1"
      >
        <!--{{doc && doc.order}}-->
        <div
          v-if="isSlot"
          class="text-truncate"
        >
          <span
            :class="{
              'text-medium-emphasis': !canFill,
              'text-accent': canFill,
            }"
          >
            {{ doc.name }}
          </span>
          <fill-slot-button
            v-if="canFillWithOne"
            :model="doc"
          />
        </div>
        <template
          v-else
        >
          <tree-node-view
            :model="doc"
          />
          <v-spacer />
          <v-btn
            v-if="doc.parentId === parentSlotId"
            variant="text"
            icon
            :disabled="context.editPermission === false"
            @click.stop="remove(doc)"
          >
            <v-icon>
              mdi-delete
            </v-icon>
          </v-btn>
        </template>
        <template v-if="condenseChild">
          <span class="mr-4">:</span>
          <tree-node-view
            :model="children[0].doc"
          />
          <v-spacer />
          <v-btn
            variant="text"
            icon
            :disabled="context.editPermission === false"
            @click.stop="remove(children[0].doc)"
          >
            <v-icon>
              mdi-delete
            </v-icon>
          </v-btn>
        </template>
      </div>
    </div>
    <v-expand-transition>
      <div
        v-show="showExpanded"
        class="ml-3 expand-area"
      >
        <v-fade-transition hide-on-leave>
          <build-tree-node-list
            v-if="showExpanded"
            :children="computedChildren"
            :parent-slot-id="computedSlotId"
            :depth="depth"
            @selected="e => $emit('selected', e)"
          />
          <div v-else>
            <div
              v-for="i in computedChildren.length"
              :key="i"
              class="dummy-node"
            />
          </div>
        </v-fade-transition>
        <div
          v-if="canFillWithMany"
        >
          <fill-slot-button
            class="ml-5"
            :model="doc"
          />
        </div>
      </div>
    </v-expand-transition>
  </v-sheet>
</template>

<script setup>
/**
* TreeNode's are list item views of character properties. Every property which
* can belong to the character is shown in the tree view of the character
* the tree view shows off the full character structure, and where each part of
* character comes from.
**/
import { ref, computed, watch, inject } from 'vue';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import FillSlotButton from '/imports/client/ui/creature/buildTree/FillSlotButton.vue';
import BuildTreeNodeList from './BuildTreeNodeList.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import restoreProperty from '/imports/api/creature/creatureProperties/methods/restoreProperty';
import getPropertyTitle from '/imports/client/ui/properties/shared/getPropertyTitle';
import { isAncestor } from '/imports/api/parenting/parentingFunctions';

defineOptions({
  name: 'BuildTreeNode',
});

const props = defineProps({
  // Children load on demand, so a collapsed node may still have some
  lazy: Boolean,
  depth: {
    type: Number,
    default: 0,
  },
  doc: {
    type: Object,
    required: true,
  },
  children: {
    type: Array,
    default: () => [],
  },
  parentSlotId: {
    type: String,
    default: undefined,
  },
  selectedNode: {
    type: Object,
    default: undefined,
  },
});

defineEmits(['selected']);

const context = inject('context', {});

const expanded = ref(props.depth <= 2);
/* expand if there's a slot needing attention:
  this.doc._descendantCanFill || (
    this.doc.type === 'propertySlot' &&
    this. node.quantityExpected?.value === 0 ||
    (this.doc.quantityExpected?.value > 1 && this.doc.spaceLeft > 0)
  )
*/

const isSlot = computed(() => {
  return props.doc.type === 'propertySlot';
});

const canFill = computed(() => {
  return !!props.doc._canFill;
});

const condenseChild = computed(() => {
  return props.doc.type === 'propertySlot' &&
    props.children.length === 1 &&
    props.children[0].doc.type !== 'propertySlot' &&
    props.doc.quantityExpected &&
    props.doc.quantityExpected.value === 1 &&
    !canFill.value;
});

const canFillWithOne = computed(() => {
  return isSlot.value &&
    canFill.value &&
    props.doc.quantityExpected &&
    props.doc.quantityExpected.value === 1 &&
    props.doc.spaceLeft === 1 &&
    !props.children?.length;
});

const canFillWithMany = computed(() => {
  return isSlot.value && canFill.value && (
    !props.doc.quantityExpected ||
    props.doc.quantityExpected.value === 0 ||
    (props.doc.quantityExpected.value > 1 && props.doc.spaceLeft > 0) ||
    (props.doc.quantityExpected.value === 1 && props.children?.length)
  );
});

const computedChildren = computed(() => {
  if (condenseChild.value) {
    return props.children[0].children;
  }
  return props.children;
});

const computedSlotId = computed(() => {
  if (condenseChild.value) {
    if (props.children[0].doc.type === 'propertySlot') {
      return props.children[0].doc._id;
    } else {
      return undefined;
    }
  } else {
    if (props.doc.type === 'propertySlot') {
      return props.doc._id;
    } else {
      return undefined;
    }
  }
});

const canExpand = computed(() => {
  return !!computedChildren.value.length || canFillWithMany.value;
});

const hasChildren = computed(() => {
  return !!props.children && !!computedChildren.value.length || props.lazy && !expanded.value;
});

const showExpanded = computed(() => {
  return canExpand.value && expanded.value;
});

watch(() => props.doc?._ancestorOfMatchedDocument, (value) => {
  expanded.value = !!value || isAncestor(props.doc, props.selectedNode);
});

watch(() => props.selectedNode?.parentId, () => {
  expanded.value = isAncestor(props.doc, props.selectedNode) || expanded.value;
});

async function remove(model) {
  const _id = model._id;
  try {
    await softRemoveProperty.callAsync({ _id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
    return;
  }
  snackbar({
    text: `Deleted ${getPropertyTitle(model)}`,
    callbackName: 'undo',
    callback() {
      return restoreProperty.callAsync({ _id });
    },
  });
}
</script>

<style lang="css" scoped>
  .rotate-90 {
    transform: rotate(90deg) translateZ(0);
  }
  .expand-area {
    box-shadow: -2px 0px 0px 0px #808080;
    margin-left: 0;
  }
  .handle {
    cursor: move;
  }
  .empty .drag-area {
    box-shadow: -2px 0px 0px 0px rgb(128, 128, 128, 0.4);
  }
  .empty .expand-button {
    opacity: 0.4;
  }
  .found {
    background: rgba(200, 0, 0, 0.1) !important;
  }
  .ghost {
    opacity: 0.5;
    background: rgba(251, 0, 0, 0.3);
  }
  .v-icon.v-icon--disabled {
    opacity: 0;
  }
  .v-icon {
    transition: none !important;
  }
  .v-theme--light .tree-node-title:hover {
    background-color: rgba(0,0,0,.04);
  }
  .v-theme--dark .tree-node-title:hover {
    background-color: rgba(255,255,255,.04);
  }
  .tree-node-title{
    transition: background ease 0.3s, color ease 0.15s;
  }
  .tree-node-title, .dummy-node {
    height: 40px;
  }
</style>
