<template>
  <v-list
    density="compact"
    class="item-list"
  >
    <draggable
      v-model="dataItems"
      style="min-height: 24px;"
      :disabled="context.editPermission === false"
      :group="`item-list`"
      ghost-class="ghost"
      draggable=".item"
      handle=".handle"
      :revert-on-spill="true"
      :item-key="itemId => itemId"
      @change="change"
    >
      <template #item="{ element: itemId }">
        <item-list-tile
          class="item"
          :data-id="itemId"
          :item-id="itemId"
          @click="clickProperty(itemId)"
        />
      </template>
    </draggable>
  </v-list>
</template>

<script setup>
import { ref, watch, onMounted, inject } from 'vue';
import draggable from 'vuedraggable';
import ItemListTile from '/imports/client/ui/properties/components/inventory/ItemListTile.vue';
import { moveWithinRoot } from '/imports/api/parenting/organizeMethods';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  itemIds: {
    type: Array,
    default: () => [],
  },
  parent: {
    type: Object,
    default: () => undefined,
  },
  preparingSpells: Boolean,
  equipment: Boolean,
});

const context = inject('context', {});

const dataItems = ref(props.itemIds || []);

watch(
  () => props.itemIds,
  (value) => {
    dataItems.value = value;
  }
);

onMounted(() => {
  dataItems.value = props.itemIds;
});

function clickProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: _id,
    data: { _id },
  });
}

async function change({ added, moved }) {
  let event = added || moved;
  if (!event) return;
  // If this item is now adjacent to another, set the order accordingly
  let order;
  const beforeId = dataItems.value[event.newIndex - 1];
  const afterId = dataItems.value[event.newIndex + 1];
  const before = beforeId && CreatureProperties.findOne(beforeId);
  const after = afterId && CreatureProperties.findOne(afterId);
  if (before) {
    order = before.right + 0.5;
  } else if (after) {
    order = after.left - 0.5;
  } else if (props.parent) {
    order = props.parent.left + 0.5;
  } else {
    order = 0.5;
  }
  let docId = event.element;
  const doc = CreatureProperties.findOne(docId);
  if (!doc) return;
  try {
    await moveWithinRoot.callAsync({
      docRef: {
        id: docId,
        collection: 'creatureProperties',
      },
      newPosition: order,
    });
    if (doc.type === 'item' && doc.equipped !== props.equipment) {
      await updateCreatureProperty.callAsync({
        _id: docId,
        path: ['equipped'],
        value: !!props.equipment,
      });
    }
  } catch (error) {
    dataItems.value = props.itemIds;
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
}
</script>

<style lang="css" scoped>
.ghost {
  opacity: 0.1;
}
</style>
