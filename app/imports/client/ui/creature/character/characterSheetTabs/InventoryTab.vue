<template>
  <div class="inventory">
    <column-layout wide-columns>
      <folder-group-card
        v-for="folder in startFolders"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />
      <div>
        <v-card>
          <v-list>
            <v-list-item>
              <template #prepend>
                <v-avatar>
                  <v-icon>$injustice</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ $t('inventory.weightCarried') }}
              </v-list-item-title>

              <template #append>
                <v-list-item-title>
                  {{ weightCarried }} lb
                </v-list-item-title>
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend>
                <v-avatar>
                  <v-icon>$cash</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ $t('inventory.netWorth') }}
              </v-list-item-title>

              <template #append>
                <v-list-item-title>
                  <coin-value :value="variables && variables.valueTotal && variables.valueTotal.value|| 0" />
                </v-list-item-title>
              </template>
            </v-list-item>
            <v-list-item v-if="variables && variables.itemsAttuned && variables.itemsAttuned.value">
              <template #prepend>
                <v-avatar>
                  <v-icon>$spell</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ $t('inventory.itemsAttuned') }}
              </v-list-item-title>

              <template #append>
                <v-list-item-title>
                  {{ variables.itemsAttuned.value }}
                </v-list-item-title>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </div>
      <div>
        <toolbar-card transparent-toolbar>
          <template #toolbar>
            <v-toolbar-title>
              {{ $t('inventory.equipped') }}
            </v-toolbar-title>
          </template>
          <v-card-text class="px-0">
            <item-list
              equipment
              :item-ids="equippedItemIds"
              :parent="equipmentParent"
            />
          </v-card-text>
        </toolbar-card>
      </div>
      <div>
        <toolbar-card transparent-toolbar>
          <template #toolbar>
            <v-toolbar-title>
              {{ $t('inventory.carried') }}
            </v-toolbar-title>
          </template>
          <v-card-text class="px-0">
            <item-list
              :item-ids="carriedItemIds"
              :parent="carriedParent"
            />
          </v-card-text>
        </toolbar-card>
      </div>
      <div
        v-for="container in containersWithoutAncestorContainers"
        :key="container._id"
      >
        <container-card :model="container" />
      </div>
      <folder-group-card
        v-for="folder in endFolders"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />
    </column-layout>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { getParentByTagSync } from '/imports/api/creature/creatureProperties/methods/getParentByTag';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import ColumnLayout from '/imports/client/ui/components/ColumnLayout.vue';
import ContainerCard from '/imports/client/ui/properties/components/inventory/ContainerCard.vue';
import ToolbarCard from '/imports/client/ui/components/ToolbarCard.vue';
import ItemList from '/imports/client/ui/properties/components/inventory/ItemList.vue';
import BUILT_IN_TAGS from '/imports/constants/BUILT_IN_TAGS';
import CoinValue from '/imports/client/ui/components/CoinValue.vue';
import stripFloatingPointOddities from '/imports/api/engine/computation/utility/stripFloatingPointOddities';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import { useTabFolders } from '/imports/client/ui/properties/components/folders/useTabFolders';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const { startFolders, endFolders, clickProperty, clickTreeProperty, softRemove } = useTabFolders(computed(() => props.creatureId), 'inventory');

const folderIds = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'folder',
    groupStats: true,
    hideStatsGroup: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { _id: 1 } }).map(folder => folder._id);
}).result;

const containers = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    parentId: {
      $nin: folderIds.value || [],
    },
    type: 'container',
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 },
  }).fetch();
}).result;


const variables = autorun(() => {
  return CreatureVariables.findOne({ _creatureId: props.creatureId }) || {};
}).result;

const containersWithoutAncestorContainers = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    $nor: [getFilter.descendantsOfAll(containers.value || [])],
    parentId: {
      $nin: folderIds.value || [],
    },
    type: 'container',
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 },
  }).fetch();
}).result;

const carriedItemIds = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    $nor: [getFilter.descendantsOfAll(containers.value || [])],
    parentId: {
      $nin: folderIds.value || [],
    },
    type: 'item',
    equipped: { $ne: true },
    removed: { $ne: true },
    deactivatedByAncestor: { $ne: true },
    deactivatedByToggle: { $ne: true },
  }, {
    sort: { left: 1 },
    fields: { _id: 1 },
  }).map(prop => prop._id);
}).result;

const equippedItemIds = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'item',
    equipped: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 },
    fields: { _id: 1 },
  }).map(prop => prop._id);
}).result;

const equipmentParent = autorun(() => {
  return getParentByTagSync(
    props.creatureId, BUILT_IN_TAGS.equipment
  ) || getParentByTagSync(
    props.creatureId, BUILT_IN_TAGS.inventory
  );
}).result;

const carriedParent = autorun(() => {
  return getParentByTagSync(
    props.creatureId, BUILT_IN_TAGS.carried
  ) || getParentByTagSync(
    props.creatureId, BUILT_IN_TAGS.inventory
  );
}).result;

const weightCarried = computed(() => {
  return stripFloatingPointOddities(
    variables.value &&
    variables.value.weightCarried &&
    variables.value.weightCarried.value || 0
  );
});
</script>

<style lang="css" scoped>

</style>
