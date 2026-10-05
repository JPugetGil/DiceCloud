<template>
  <v-list
    density="compact"
    class="item-list"
  >
    <!--
      Dragging an item (A10): its neighbours slide aside, its place shows
      dashed where it will land, and it is tinted once dropped. Reduced
      animations: nothing slides
    -->
    <draggable
      v-model="dataItems"
      style="min-height: 24px;"
      :disabled="context.editPermission === false"
      :group="`item-list`"
      :animation="reducedMotion ? 0 : DURATION.short"
      ghost-class="item-list__drop"
      draggable=".item"
      handle=".handle"
      :revert-on-spill="true"
      :item-key="itemId => itemId"
      @change="change"
    >
      <template #item="{ element: itemId }">
        <item-list-tile
          class="item"
          :class="{ 'item-list__dropped': itemId === droppedId }"
          :data-id="itemId"
          :item-id="itemId"
          @click="clickProperty(itemId)"
        />
      </template>
    </draggable>
  </v-list>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, inject } from 'vue';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { DURATION } from '/imports/ui/utility/motion';
import draggable from 'vuedraggable';
import ItemListTile from '/imports/ui/properties/components/inventory/ItemListTile.vue';
import { moveWithinRoot } from '/imports/api/parenting/organizeMethods';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

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
  equipment: Boolean,
});

const context = inject('context', {});
const reducedMotion = useReducedMotion();

// The item just dropped, tinted for a moment
const droppedId = ref(undefined);
let droppedTimer;
onBeforeUnmount(() => clearTimeout(droppedTimer));
function markDropped(itemId) {
  clearTimeout(droppedTimer);
  droppedId.value = itemId;
  droppedTimer = setTimeout(() => { droppedId.value = undefined; }, 600);
}

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
  markDropped(event.element);
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
/* Where the item will land: its place, dashed and empty */
.item-list__drop {
  border-radius: 4px;
  outline: 2px dashed rgba(var(--v-theme-primary), 0.7);
  outline-offset: -2px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.item-list__drop :deep(*) {
  visibility: hidden;
}

.item-list__dropped {
  animation: item-list-dropped 600ms var(--motion-easing-standard);
}

@keyframes item-list-dropped {
  0%, 40% {
    background-color: rgba(var(--v-theme-primary), 0.16);
  }
  100% {
    background-color: transparent;
  }
}
</style>
