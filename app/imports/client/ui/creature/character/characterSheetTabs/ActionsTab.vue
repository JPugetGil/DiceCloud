<template>
  <div
    class="actions-tab ma-2"
  >
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
        v-for="action in actions"
        :key="action._id"
        class="action"
      >
        <action-card
          :model="action"
          :data-id="action._id"
          @click="clickProperty({_id: action._id})"
          @sub-click="_id => clickTreeProperty({_id})"
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

<script setup>
import { toRef } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ColumnLayout from '/imports/client/ui/components/ColumnLayout.vue';
import ActionCard from '/imports/client/ui/properties/components/actions/ActionCard.vue';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useTabFolders } from '/imports/client/ui/properties/components/folders/useTabFolders';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const tabName = 'actions';

const {
  startFolders,
  endFolders,
  clickProperty,
  clickTreeProperty,
  softRemove,
} = useTabFolders(toRef(props, 'creatureId'), tabName);

const actions = autorun(() => {
  const folderIds = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'folder',
    groupStats: true,
    hideStatsGroup: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { _id: 1 } }).map(folder => folder._id);

  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    'parentId': {
      $nin: folderIds,
    },
    type: 'action',
    actionType: { $ne: 'event' },
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { actionType: 1, order: 1 },
  });
}).result;
</script>
