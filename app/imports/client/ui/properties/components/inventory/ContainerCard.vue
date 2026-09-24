<template>
  <toolbar-card
    :color="model.color"
    :data-id="model._id"
    @toolbarclick="clickContainer(model._id)"
  >
    <template #toolbar>
      <v-toolbar-title>
        {{ model.name }}
      </v-toolbar-title>
      <v-spacer />
      <v-toolbar-title>
        <v-icon
          size="small"
          style="width: 16px;"
          class="mr-1"
        >
          $weight
        </v-icon>
        {{ weight }}
      </v-toolbar-title>
      <v-toolbar-title
        class="d-flex align-center"
        style="flex: 0 1 auto;"
      >
        <v-icon
          size="small"
          style="width: 16px;"
          class="mr-1"
        >
          $two_coins
        </v-icon>
        <coin-value :value="value" />
      </v-toolbar-title>
    </template>
    <v-card-text class="px-0">
      <item-list
        :item-ids="itemIds"
        :parent="model"
      />
    </v-card-text>
  </toolbar-card>
</template>

<script setup>
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ToolbarCard from '/imports/client/ui/components/ToolbarCard.vue';
import ItemList from '/imports/client/ui/properties/components/inventory/ItemList.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CoinValue from '/imports/client/ui/components/CoinValue.vue';
import stripFloatingPointOddities from '/imports/api/engine/computation/utility/stripFloatingPointOddities';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});


const weight = computed(() => {
  const contentWeight = props.model.contentsWeightless ?
    0 :
    props.model.contentsWeight || 0;
  const ownWeight = props.model.weight || 0;
  return stripFloatingPointOddities(contentWeight + ownWeight);
});

const value = computed(() => {
  const contentValue = props.model.contentsValue || 0;
  const ownValue = props.model.value || 0;
  return contentValue + ownValue;
});

function clickContainer(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}


const itemIds = autorun(() => {
  return CreatureProperties.find({
    'parentId': props.model._id,
    type: { $in: ['item', 'container'] },
    removed: { $ne: true },
    equipped: { $ne: true },
    deactivatedByAncestor: { $ne: true },
    deactivatedByToggle: { $ne: true },
  }, {
    sort: { left: 1 },
    fields: { _id: 1 }
  }).map(prop => prop._id);
}).result;
</script>

<style lang="css" scoped>

</style>
