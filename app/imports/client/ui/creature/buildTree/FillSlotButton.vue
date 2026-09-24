<template>
  <v-btn
    v-if="!model.quantityExpected || !model.quantityExpected.value || model.spaceLeft"
    variant="text"
    :icon="!$slots.default"
    v-bind="$attrs"
    :data-id="`slot-add-button-${model._id}`"
    class="slot-add-button text-accent"
    @click.stop="fillSlot()"
  >
    <slot>
      <v-icon>mdi-plus</v-icon>
    </slot>
  </v-btn>
</template>

<script setup lang="js">
import { inject } from 'vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

function fillSlot() {
  let slotId = props.model._id;
  let creatureId = context.creatureId;
  dialogStackStore.pushDialogStack({
    component: 'slot-fill-dialog',
    elementId: `slot-add-button-${slotId}`,
    data: {
      slotId,
      creatureId,
    },
    async callback(nodeIds) {
      if (!nodeIds || !nodeIds.length) return;
      const newPropertyId = await insertPropertyFromLibraryNode.callAsync({
        nodeIds,
        parentRef: {
          'id': slotId,
          'collection': 'creatureProperties',
        },
      });
      return `slot-child-${newPropertyId}`;
    }
  });
}
</script>

<style>

</style>