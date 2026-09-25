<template>
  <dialog-base>
    <template #replace-toolbar="{flat}">
      <property-toolbar
        :model="model"
        :editing="editing"
        :flat="flat"
        :embedded="embedded"
        style="flex-grow: 0;"
        @duplicate="duplicate"
        @remove="remove"
        @copy-to-library="copyToLibrary"
        @toggle-editing="editing = !editing"
      />
    </template>
    <template v-if="model">
      <div
        class="d-flex flex-1-1 mb-4"
      >
        <property-breadcrumbs
          :model="model"
          :editing="editing"
          :embedded="embedded"
          @select-sub-property="selectSubProperty"
        />
        <v-spacer />
        <v-chip disabled>
          {{ typeName }}
        </v-chip>
      </div>
      <v-fade-transition
        mode="out-in"
      >
        <div v-if="editing">
          <property-form
            :key="_id"
            class="creature-property-form"
            :model="model"
            :embedded="embedded"
            @change="change"
            @push="push"
            @pull="pull"
            @add-child="addProperty"
            @select-sub-property="selectSubProperty"
          />
        </div>
        <property-viewer
          v-else
          :key="_id"
          :model="model"
          @select-sub-property="selectSubProperty"
          @remove="remove"
          @change="change"
        />
      </v-fade-transition>
    </template>
    <template
      v-if="!embedded"
      #actions
    >
      <div
        class="d-flex flex-1-1"
      >
        <v-spacer />
        <v-btn
          variant="text"
          color="accent"
          @click="dialogStackStore.popDialogStack()"
        >
          {{ $t('common.close') }}
        </v-btn>
      </div>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch, provide, reactive, nextTick } from 'vue';
import { autorun } from 'vue-meteor-tracker';

import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import pushToProperty from '/imports/api/creature/creatureProperties/methods/pushToProperty';
import pullFromProperty from '/imports/api/creature/creatureProperties/methods/pullFromProperty';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import restoreProperty from '/imports/api/creature/creatureProperties/methods/restoreProperty';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import duplicateProperty from '/imports/api/creature/creatureProperties/methods/duplicateProperty';
import Creatures from '/imports/api/creature/creatures/Creatures';
import PropertyToolbar from '/imports/client/ui/components/propertyToolbar.vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import PropertyForm from '/imports/client/ui/properties/PropertyForm.vue';
import getPropertyTitle from '/imports/client/ui/properties/shared/getPropertyTitle';

import { get } from 'lodash';
import equipItem from '/imports/api/creature/creatureProperties/methods/equipItem';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
import PropertyBreadcrumbs from '/imports/client/ui/creature/creatureProperties/PropertyBreadcrumbs.vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import PropertyViewer from '/imports/client/ui/properties/shared/PropertyViewer.vue';
import copyPropertyToLibrary from '/imports/api/creature/creatureProperties/methods/copyPropertyToLibrary';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    default: undefined,
  },
  embedded: Boolean, // This dialog is embedded in a page
  startInEditTab: Boolean,
});

const emit = defineEmits(['duplicated', 'removed', 'select-sub-property']);


const editing = ref(!!props.startInEditTab);
// CurrentId lags behind Id by one tick so that events fired by destroying
// forms keyed to the old ID are applied before the new ID overwrites it
const currentId = ref(undefined);

watch(() => props._id, (newId) => {
  nextTick(() => {
    currentId.value = newId;
  });
}, { immediate: true });

const model = autorun(() => CreatureProperties.findOne(currentId.value)).result;

const creature = computed(() => {
  if (!model.value) return;
  return Creatures.findOne(model.value.root.id);
});

const creatureId = computed(() => {
  return creature.value && creature.value._id;
});

const editPermission = autorun(() => {
  if (!creature.value) return false;
  return hasEditPermission(creature.value, Meteor.user());
}).result;

const typeName = computed(() => {
  if (!model.value) return;
  return getPropertyName(model.value.type);
});

provide('context', reactive({
  creatureId,
  editPermission,
}));

async function duplicate() {
  try {
    const id = await duplicateProperty.callAsync({ _id: currentId.value });
    if (props.embedded) {
      emit('duplicated', id);
    } else {
      dialogStackStore.popDialogStack();
    }
  } catch (error) {
    console.error(error);
  }
}

async function change(arg) {
  const { path, value, ack } = arg;
  try {
    if (path && path[0] === 'equipped') {
      await equipItem.callAsync({ _id: currentId.value, equipped: value });
    } else {
      await updateCreatureProperty.callAsync({ _id: currentId.value, path, value });
    }
    ack?.();
  } catch (error) {
    if (ack) {
      ack(error);
    } else {
      console.error(error);
    }
  }
}


async function push({ path, value, ack }) {
  try {
    await pushToProperty.callAsync({ _id: currentId.value, path, value });
    ack?.();
  } catch (error) {
    ack?.(error);
  }
}

async function pull({ path, ack }) {
  let itemId = get(model.value, path)._id;
  path.pop();
  try {
    await pullFromProperty.callAsync({ _id: currentId.value, path, itemId });
    ack?.();
  } catch (error) {
    ack?.(error);
  }
}

async function remove() {
  const id = currentId.value;
  try {
    await softRemoveProperty.callAsync({ _id: id });
    if (props.embedded) {
      emit('removed');
    } else {
      await dialogStackStore.popDialogStack();
    }
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
    return;
  }
  snackbar({
    text: t('common.deleted', { name: getPropertyTitle(model.value) }),
    callbackName: 'undo',
    callback() {
      return restoreProperty.callAsync({ _id: id });
    },
  });
}

function selectSubProperty(_id) {
  if (props.embedded) {
    emit('select-sub-property', _id);
    return;
  }
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `tree-node-${_id}`,
    data: {
      _id,
      startInEditTab: editing.value,
    },
  });
}

function copyToLibrary() {
  const thisId = props._id;
  dialogStackStore.pushDialogStack({
    component: 'move-library-node-dialog',
    elementId: 'property-toolbar-menu-button',
    data: {
      action: t('common.copy'),
    },
    async callback(parentId) {
      if (!parentId) return;
      try {
        await copyPropertyToLibrary.callAsync({
          propId: thisId,
          parentRef: {
            collection: 'libraryNodes',
            id: parentId
          },
        });
        snackbar({ text: t('common.copiedSuccessfully') });
      } catch (error) {
        console.error(error);
        snackbar({ text: error.reason || error.message || error.toString() });
      }
    }
  });
}

function addProperty({ elementId, suggestedType }) {
  let parentPropertyId = model.value._id;
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId,
    data: {
      parentDoc: model.value,
      creatureId: creatureId.value,
      suggestedType,
      noBackdropClose: true,
    },
    async callback(result) {
      if (!result) return;
      let parentRef = {
        id: parentPropertyId,
        collection: 'creatureProperties',
      };
      if (Array.isArray(result)) {
        let nodeIds = result;
        let id = await insertPropertyFromLibraryNode.callAsync({ nodeIds, parentRef });
        return `tree-node-${id}`;
      } else {
        let creatureProperty = result;
        // Insert the property
        let id = await insertProperty.callAsync({ creatureProperty, parentRef });
        return `tree-node-${id}`;
      }
    }
  });
}
</script>

<style lang="css" scoped>
</style>
