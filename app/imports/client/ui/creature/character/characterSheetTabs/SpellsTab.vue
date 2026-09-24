<template>
  <div class="spells">
    <column-layout wide-columns>
      <folder-group-card
        v-for="folder in startFolders"
        :key="folder._id"
        :model="folder"
        @click-property="clickProperty"
        @sub-click="_id => clickTreeProperty({_id})"
        @remove="softRemove"
      />
      <div
        v-if="hasSpellSlots || hasSpells"
        class="spell-slots"
      >
        <spell-slot-card
          :creature-id="creatureId"
          :spell-slots="spellSlots"
          :has-spells="hasSpells"
        />
      </div>
      <div v-if="spellsWithoutList && spellsWithoutList.length">
        <v-card>
          <spell-list
            :spells="spellsWithoutList"
            :parent-ref="{id: creatureId, collection: 'creatures'}"
          />
        </v-card>
      </div>
      <div
        v-for="spellList in spellListsWithoutAncestorSpellLists"
        :key="spellList._id"
      >
        <spellList-card
          :model="spellList"
          :organize="organize"
        />
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

<script setup lang="js">
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ColumnLayout from '/imports/client/ui/components/ColumnLayout.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import SpellListCard from '/imports/client/ui/properties/components/spells/SpellListCard.vue';
import SpellList from '/imports/client/ui/properties/components/spells/SpellList.vue';
import SpellSlotCard from '/imports/client/ui/properties/components/attributes/SpellSlotCard.vue';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useTabFolders } from '/imports/client/ui/properties/components/folders/useTabFolders';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  }
});

const organize = ref(false);
const tabName = ref('spells');

const {
  startFolders,
  endFolders,
  clickProperty,
  clickTreeProperty,
  softRemove
} = useTabFolders(computed(() => props.creatureId), tabName);

const folderIds = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  type: 'folder',
  groupStats: true,
  hideStatsGroup: true,
  removed: { $ne: true },
  inactive: { $ne: true },
}, { fields: { _id: 1 } }).map(folder => folder._id)).result;

const hasSpellSlots = autorun(() => !!CreatureProperties.findOne({
  ...getFilter.descendantsOfRoot(props.creatureId),
  inactive: { $ne: true },
  removed: { $ne: true },
  overridden: { $ne: true },
  level: { $ne: 0 },
  type: 'attribute',
  attributeType: 'spellSlot',
})).result;

const spellSlots = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  'parentId': {
    $nin: folderIds.value || [],
  },
  inactive: { $ne: true },
  removed: { $ne: true },
  overridden: { $ne: true },
  type: 'attribute',
  attributeType: 'spellSlot',
  $nor: [
    { hideWhenTotalZero: true, total: 0 },
    { hideWhenValueZero: true, value: 0 },
  ],
}, {
  sort: { left: 1 }
})).result;

const spellLists = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  'parentId': {
    $nin: folderIds.value || [],
  },
  type: 'spellList',
  removed: { $ne: true },
  inactive: { $ne: true },
}, {
  sort: { left: 1 }
}).fetch()).result;

const hasSpells = autorun(() => !!CreatureProperties.findOne({
  ...getFilter.descendantsOfRoot(props.creatureId),
  type: 'spell',
  removed: { $ne: true },
  inactive: { $ne: true },
})).result;

const spellsWithoutList = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  $nor: [getFilter.descendantsOfAll(spellLists.value || [])],
  parentId: {
    $nin: folderIds.value || [],
  },
  type: 'spell',
  removed: { $ne: true },
  deactivatedByAncestor: { $ne: true },
  deactivatedByToggle: { $ne: true },
}, {
  sort: {
    level: 1,
    order: 1,
  }
})).result;

const spellListsWithoutAncestorSpellLists = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  $nor: [getFilter.descendantsOfAll(spellLists.value || [])],
  parentId: {
    $nin: folderIds.value || [],
  },
  type: 'spellList',
  removed: { $ne: true },
  inactive: { $ne: true },
}, {
  sort: { left: 1 }
})).result;


</script>

<style lang="css" scoped>

</style>
