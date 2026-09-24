<template>
  <dialog-base>
    <template #replace-toolbar="{flat}">
      <property-toolbar
        :model="model"
        :editing="editing"
        :flat="flat"
        :embedded="embedded"
        @duplicate="duplicate"
        @move="move"
        @copy="copy"
        @remove="remove"
        @make-reference="makeReference"
        @toggle-editing="editing = !editing"
        @color-changed="value => change({path: ['color'], value})"
      />
    </template>
    <v-fade-transition>
      <div
        v-if="model"
        class="d-flex flex-1-1 mb-4"
      >
        <property-breadcrumbs
          :model="model"
          :editing="editing"
          :embedded="embedded"
          collection="libraryNodes"
          @select-sub-property="selectSubProperty"
        />
        <v-spacer />
        <v-chip disabled>
          {{ typeName }}
        </v-chip>
      </div>
    </v-fade-transition>
    <v-fade-transition
      mode="out-in"
    >
      <div v-if="!_id" />
      <div
        v-else-if="!libraryNodeReady"
        class="fill-height d-flex flex-1-1 justify-center align-center"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
        />
      </div>
      <property-form
        v-else-if="model && editing"
        :key="_id"
        class="library-node-form"
        collection="libraryNodes"
        :model="model"
        :embedded="embedded"
        @change="change"
        @push="push"
        @pull="pull"
        @add-child="addLibraryNode"
        @select-sub-property="selectSubProperty"
      />
      <property-viewer
        v-else-if="model"
        :key="_id"
        :model="model"
        collection="libraryNodes"
        @select-sub-property="selectSubProperty"
      />
    </v-fade-transition>
    <template
      v-if="!embedded"
      #actions
    >
      <div
        class="d-flex flex-1-1 justify-end"
      >
        <template v-if="selection">
          <v-btn
            variant="text"
            @click="dialogStackStore.popDialogStack(false)"
          >
            Cancel
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            @click="dialogStackStore.popDialogStack(true)"
          >
            Select
          </v-btn>
        </template>
        <v-btn
          v-else
          variant="text"
          @click="dialogStackStore.popDialogStack()"
        >
          Done
        </v-btn>
      </div>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch, nextTick, provide, reactive } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasDocCopyPermission, hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import LibraryNodes, {
  updateLibraryNode,
  pushToLibraryNode,
  pullFromLibraryNode,
  softRemoveLibraryNode,
  restoreLibraryNode,
  insertNode,
} from '/imports/api/library/LibraryNodes';
import duplicateLibraryNode from '/imports/api/library/methods/duplicateLibraryNode';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import PropertyToolbar from '/imports/client/ui/components/propertyToolbar.vue';
import { getPropertyName } from '/imports/constants/PROPERTIES';
import { get } from 'lodash';

import { organizeDoc } from '/imports/api/parenting/organizeMethods';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import getPropertyTitle from '/imports/client/ui/properties/shared/getPropertyTitle';
import copyLibraryNodeTo from '/imports/api/library/methods/copyLibraryNodeTo';
import PropertyForm from '/imports/client/ui/properties/PropertyForm.vue';
import PropertyViewer from '/imports/client/ui/properties/shared/PropertyViewer.vue';
import PropertyBreadcrumbs from '/imports/client/ui/creature/creatureProperties/PropertyBreadcrumbs.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    default: undefined,
  },
  startInEditTab: Boolean,
  embedded: Boolean, // This dialog is embedded in a page
  selection: Boolean, // This dialog is being used to select a node
});

const emit = defineEmits(['duplicated', 'select-sub-property', 'removed']);

const editing = ref(!!props.startInEditTab);
// CurrentId lags behind Id by one tick so that events fired by destroying
// forms keyed to the old ID are applied before the new ID overwrites it
const currentId = ref(undefined);
const isLibraryForm = ref(true);

const { ready: libraryNodeReady } = subscribe(() => ['libraryNode', props._id]);

const model = autorun(() => LibraryNodes.findOne(currentId.value)).result;

const editPermission = autorun(() => hasDocEditPermission(model.value, Meteor.user())).result;
const copyPermission = autorun(() => hasDocCopyPermission(model.value, Meteor.user())).result;

provide('context', reactive({
  get editPermission() { return editPermission.value; },
  get copyPermission() { return copyPermission.value; },
  get isLibraryForm() { return isLibraryForm.value; },
}));

const typeName = computed(() => {
  if (!model.value) return;
  return getPropertyName(model.value.type);
});

watch(() => props._id, (newId) => {
  nextTick(() => {
    currentId.value = newId;
  });
}, { immediate: true });

async function duplicate() {
  try {
    const duplicateId = await duplicateLibraryNode.callAsync({ _id: currentId.value });
    if (props.embedded) {
      emit('duplicated', duplicateId);
    } else {
      await dialogStackStore.popDialogStack();
    }
  } catch (error) {
    console.error(error);
  }
}

async function makeReference() {
  try {
    const docId = await insertNode.callAsync({
      libraryNode: {
        type: 'reference',
        ref: {
          collection: 'libraryNodes',
          id: model.value._id,
        },
      },
      parentRef: model.value.parent,
    });
    if (props.embedded) {
      emit('duplicated', docId);
    } else {
      await dialogStackStore.popDialogStack();
    }
  } catch (error) {
    console.error(error);
  }
}

function selectSubProperty(_id) {
  if (props.embedded) {
    emit('select-sub-property', _id);
    return;
  }
  dialogStackStore.pushDialogStack({
    component: 'library-node-dialog',
    elementId: `tree-node-${_id}`,
    data: {
      _id,
      startInEditTab: editing.value,
    },
  });
}

function move() {
  const id = props._id;
  dialogStackStore.pushDialogStack({
    component: 'move-library-node-dialog',
    elementId: 'property-toolbar-menu-button',
    async callback(parentId) {
      if (!parentId) return;
      try {
        await organizeDoc.callAsync({
          docRef: {
            collection: 'libraryNodes',
            id,
          },
          parentRef: {
            collection: 'libraryNodes',
            id: parentId
          },
        });
      } catch (error) {
        console.error(error);
      }
    }
  });
}

function copy() {
  const thisId = props._id;
  dialogStackStore.pushDialogStack({
    component: 'move-library-node-dialog',
    elementId: 'property-toolbar-menu-button',
    data: {
      action: 'Copy',
    },
    async callback(parentId) {
      if (!parentId) return;
      try {
        await copyLibraryNodeTo.callAsync({
          _id: thisId,
          parent: {
            collection: 'libraryNodes',
            id: parentId
          },
        });
        snackbar({ text: 'Copied successfully' });
      } catch (error) {
        console.error(error);
        snackbar({ text: error.reason || error.message || error.toString() });
      }
    }
  });
}

async function change({ path, value, ack }) {
  try {
    await updateLibraryNode.callAsync({ _id: currentId.value, path, value });
    ack?.();
  } catch (error) {
    if (ack) ack(error && error.reason || error);
    else console.error(error);
  }
}

async function push({ path, value, ack }) {
  try {
    await pushToLibraryNode.callAsync({ _id: currentId.value, path, value });
    ack?.();
  } catch (error) {
    if (ack) ack(error && error.reason || error);
    else console.error(error);
  }
}

async function pull({ path, ack }) {
  let itemId = get(model.value, path)._id;
  path.pop();
  try {
    await pullFromLibraryNode.callAsync({ _id: currentId.value, path, itemId });
    ack?.();
  } catch (error) {
    if (ack) ack(error && error.reason || error);
    else console.error(error);
  }
}

function addLibraryNode({ elementId, suggestedType }) {
  let parentPropertyId = model.value._id;
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId,
    data: {
      parentDoc: model.value,
      creatureId: undefined, // this.creatureId was previously referenced but undefined
      hideLibraryTab: true,
      suggestedType,
      noBackdropClose: true,
      showLibraryOnlyProps: true,
      collection: 'libraryNodes',
    },
    async callback(result) {
      if (!result) return;
      let parentRef = {
        id: parentPropertyId,
        collection: 'libraryNodes',
      };
      let libraryNode = result;
      // Insert the property
      let id = await insertNode.callAsync({ libraryNode, parentRef });
      return `tree-node-${id}`;
    }
  });
}

async function remove() {
  let _id = currentId.value;
  try {
    await softRemoveLibraryNode.callAsync({ _id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
    return;
  }
  if (props.embedded) {
    emit('removed');
  } else {
    dialogStackStore.popDialogStack();
  }
  snackbar({
    text: `Deleted ${getPropertyTitle(model.value)}`,
    callbackName: 'undo',
    callback() {
      return restoreLibraryNode.callAsync({ _id });
    },
  });
}
</script>

<style lang="css" scoped>
</style>
