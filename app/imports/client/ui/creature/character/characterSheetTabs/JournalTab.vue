<template>
  <div class="build-tab">
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
        <creature-summary :creature="creature" />
      </div>
      <div
        v-for="note in notes"
        :key="note._id"
      >
        <note-card
          :model="note"
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
import { ref, toRefs } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import ColumnLayout from '/imports/client/ui/components/ColumnLayout.vue';
import Creatures from '/imports/api/creature/creatures/Creatures';
import NoteCard from '/imports/client/ui/properties/components/persona/NoteCard.vue';
import CreatureSummary from '/imports/client/ui/creature/character/CreatureSummary.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import FolderGroupCard from '/imports/client/ui/properties/components/folders/FolderGroupCard.vue';
import { useTabFolders } from '/imports/client/ui/properties/components/folders/useTabFolders';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const { creatureId } = toRefs(props);
const tabName = ref('journal');

const {
  startFolders,
  endFolders,
  clickProperty,
  clickTreeProperty,
  softRemove,
} = useTabFolders(creatureId, tabName);

const notes = autorun(() => {
  // Get all the notes that aren't children of group folders or of other displayed notes
  const folderIds = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(props.creatureId),
    type: 'folder',
    groupStats: true,
    hideStatsGroup: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { _id: 1 } }).map(folder => folder._id);

  const noteFilter = {
    ...getFilter.descendantsOfRoot(props.creatureId),
    'parentId': {
      $nin: folderIds,
    },
    type: 'note',
    removed: { $ne: true },
    inactive: { $ne: true },
  };
  const allNotes = CreatureProperties.find(noteFilter, {
    sort: { left: 1 },
  }).fetch();
  
  return CreatureProperties.find({
    ...noteFilter,
    ...getFilter.descendantsOfRoot(props.creatureId),
    $nor: [getFilter.descendantsOfAll(allNotes)],
  }, {
    sort: {left: 1},
  });
}).result;

const creature = autorun(() => Creatures.findOne(props.creatureId)).result;
</script>

<style lang="css" scoped>

</style>.result