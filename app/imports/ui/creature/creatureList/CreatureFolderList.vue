<template>
  <!--
    Compact, a folder's characters sit just inside it: by default they are
    pushed in by the room of a prepend icon too (56px in all).
    A group of links, not a list: Vuetify's role="list" may hold none
  -->
  <v-list
    v-model:opened="openFolders"
    :nav="nav"
    :density="dense ? 'compact' : undefined"
    :indent="dense ? 12 : undefined"
    class="creature-folder-list"
    role="group"
    :aria-label="$t('nav.characters')"
  >
    <creature-list
      :creatures="creatures"
      :selection="selection"
      :selected-creature="selectedCreature"
      :dense="dense"
      :drop-hint="!dense && !!draggingFrom"
      @creature-selected="id => emit('creature-selected', id)"
      @dragging="folderId => draggingFrom = folderId"
    />
    <v-slide-x-transition
      group
      leave-absolute
    >
      <v-list-group
        v-for="folder in folders"
        :key="folder._id"
        :value="folder._id"
        :raw-id="`${listId}-${folder._id}`"
      >
        <template #activator="{ props: activatorProps, isOpen }">
          <!-- Opens its folder: a button, not the option Vuetify makes it -->
          <creature-folder-header
            v-bind="activatorProps"
            role="button"
            :aria-expanded="isOpen"
            :aria-selected="undefined"
            :open="isOpen"
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
          @dragging="folderId => draggingFrom = folderId"
        />
      </v-list-group>
    </v-slide-x-transition>
  </v-list>
</template>

<script setup>
import { ref, useId } from 'vue';
import CreatureFolderHeader from '/imports/ui/creature/creatureList/CreatureFolderHeader.vue';
import CreatureList from '/imports/ui/creature/creatureList/CreatureList.vue';

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

// Ids of the open folders: Vuetify keeps a group's open state on its list
const openFolders = ref([]);
// The sidebar and the page list the same folders: keep their element ids apart
const listId = useId();
// The folder a character is dragged out of: the list of characters in no
// folder then shows that it takes it
const draggingFrom = ref(undefined);
</script>

<style lang="css">
.creature-folder-list .v-list-group__header .v-list-item__append {
  margin-inline-start: 0;
}
</style>
