<template>
  <v-list
    :nav="nav"
    :density="dense ? 'compact' : undefined"
    class="creature-folder-list"
  >
    <creature-list
      :creatures="creatures"
      :selection="selection"
      :selected-creature="selectedCreature"
      :dense="dense"
      @creature-selected="id => emit('creature-selected', id)"
    />
    <v-slide-x-transition
      group
      leave-absolute
    >
      <v-list-group
        v-for="folder in folders"
        :key="folder._id"
        v-model="openFolders[folder._id]"
        :dense="dense"
      >
        <template #activator>
          <creature-folder-header
            :open="openFolders[folder._id]"
            :model="folder"
            :selection="selection"
            :dense="dense"
          />
        </template>
        <creature-list
          :creatures="folder.creatures"
          :folder-id="folder._id"
          :selection="selection"
          :selected-creature="selectedCreature"
          :dense="dense"
          @creature-selected="id => emit('creature-selected', id)"
        />
      </v-list-group>
    </v-slide-x-transition>
  </v-list>
</template>

<script setup>
import { ref } from 'vue';
import CreatureFolderHeader from '/imports/client/ui/creature/creatureList/CreatureFolderHeader.vue';
import CreatureList from '/imports/client/ui/creature/creatureList/CreatureList.vue';

defineProps({
  creatures: {
    type: Array,
    default: () => [],
  },
  folders: {
    type: Array,
    default: () => [],
  },
  selection: Boolean,
  selectedCreature: {
    type: String,
    default: undefined,
  },
  dense: Boolean,
  nav: Boolean,
});

const emit = defineEmits(['creature-selected']);

const openFolders = ref({});
</script>

<style lang="css">
.creature-folder-list .v-list-group__header .v-list-item__append {
  margin-inline-start: 0 !important;
}
</style>
