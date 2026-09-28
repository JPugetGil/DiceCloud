<template>
  <div class="features">
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
        v-for="feature in features"
        :key="feature._id"
      >
        <feature-card
          :model="feature"
          :data-id="feature._id"
          @click="featureClicked(feature)"
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
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import ColumnLayout from '/imports/client/ui/components/ColumnLayout.vue';
import FeatureCard from '/imports/client/ui/properties/components/features/FeatureCard.vue';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useTabFolders } from '/imports/client/ui/properties/components/folders/useTabFolders';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const tabName = 'features';


const {
  startFolders,
  endFolders,
  clickProperty,
  clickTreeProperty,
  softRemove,
} = useTabFolders(toRef(props, 'creatureId'), tabName);

const features = autorun(() => {
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
    type: 'feature',
    removed: { $ne: true },
    inactive: { $ne: true },
  }, {
    sort: { left: 1 }
  }).fetch();
}).result;

function featureClicked({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}
</script>

<style lang="css" scoped>

</style>
