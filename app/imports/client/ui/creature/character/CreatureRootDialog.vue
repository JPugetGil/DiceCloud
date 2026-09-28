<template>
  <dialog-base>
    <template #replace-toolbar="{flat}">
      <property-toolbar
        :model="creature"
        :editing="editing"
        :flat="flat"
        :embedded="embedded"
        style="flex-grow: 0;"
        @toggle-editing="editing = !editing"
      />
    </template>
    <template v-if="_id">
      <v-fade-transition
        mode="out-in"
      >
        <div v-if="editing">
          <creature-properties-tree
            style="width: 100%;"
            class="mb-2"
            organize
            :root="{collection: 'creatures', id: _id}"
            @length="childrenLength = $event"
            @selected="selectSubProperty"
          />
          <v-btn
            icon
            variant="outlined"
            color="accent"
            data-id="insert-creature-property-btn"
            @click="addProperty"
          >
            <v-icon>
              mdi-plus
            </v-icon>
          </v-btn>
        </div>
        <div v-else>
          <creature-properties-tree
            style="width: 100%;"
            :root="{collection: 'creatures', id: _id}"
            @length="childrenLength = $event"
            @selected="selectSubProperty"
          />
        </div>
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
import { ref, computed, watch, nextTick, provide, reactive } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import Creatures from '/imports/api/creature/creatures/Creatures';
import PropertyToolbar from '/imports/client/ui/components/propertyToolbar.vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import CreaturePropertiesTree from '/imports/client/ui/creature/creatureProperties/CreaturePropertiesTree.vue';

import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    default: undefined,
  },
  embedded: Boolean, // This dialog is embedded in a page
  startInEditTab: Boolean,
});


const editing = ref(!!props.startInEditTab);
// CurrentId lags behind Id by one tick so that events fired by destroying
// forms keyed to the old ID are applied before the new ID overwrites it
const currentId = ref(undefined);
const childrenLength = ref(0);

const creature = computed(() => Creatures.findOne(props._id));
const creatureId = computed(() => props._id);
const editPermission = autorun(() => hasEditPermission(creature.value, Meteor.user())).result;

// Provide context reactively to descendant components
provide('context', reactive({
  get creatureId() { return creatureId.value; },
  get editPermission() { return editPermission.value; },
}));

watch(() => props._id, (newId) => {
  nextTick(() => {
    currentId.value = newId;
  });
}, { immediate: true });

function selectSubProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `tree-node-${_id}`,
    data: {
      _id,
      startInEditTab: editing.value,
    },
  });
}

function addProperty() {
  let parentPropertyId = props._id;
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId: 'insert-creature-property-btn',
    data: {
      parentDoc: creature.value,
      creatureId: props._id,
      noBackdropClose: true,
    },
    async callback(result) {
      if (!result) return;
      let parentRef = {
        id: parentPropertyId,
        collection: 'creatures',
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
