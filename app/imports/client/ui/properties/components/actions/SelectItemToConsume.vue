<template>
  <v-list v-if="items?.length">
    <v-list-item
      v-for="item in items"
      :key="item._id"
      @click="selectItem(item._id)"
    >
      <item-tree-node
        :model="item"
        :selected="itemConsumed.itemId === item._id"
      />
    </v-list-item>
  </v-list>
  <v-card v-else>
    <v-card-text>
      No active items found with the tag "{{ itemConsumed.tag }}"
    </v-card-text>
  </v-card>
</template>

<script setup lang="js">
import ItemTreeNode from '/imports/client/ui/properties/treeNodeViews/ItemTreeNode.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import selectAmmoItem from '/imports/api/creature/creatureProperties/methods/selectAmmoItem';
import { findIndex } from 'lodash';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { autorun } from 'vue-meteor-tracker';
import { computed } from 'vue';

const props = defineProps({
  action: {
    type: Object,
    required: true,
  },
  itemConsumed: {
    type: Object,
    required: true,
  },
});

const itemsResult = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.action.root.id),
    type: 'item',
    tags: props.itemConsumed.tag,
    removed: {$ne: true},
    inactive: {$ne: true},
  }, {
    sort: {left: 1},
    fields: {equipped: false},
  }).fetch();
});
const items = computed(() => itemsResult.result.value || []);

async function selectItem(itemId){
  let itemConsumedIndex = findIndex(
    props.action.resources.itemsConsumed,
    item => item._id === props.itemConsumed._id
  );
  try {
    await selectAmmoItem.callAsync({
      actionId: props.action._id,
      itemId,
      itemConsumedIndex
    });
  } catch (error) {
    console.error(error);
  }
}
</script>

<style lang="css" scoped>
</style>
