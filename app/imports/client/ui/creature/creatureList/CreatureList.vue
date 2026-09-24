<template>
  <draggable
    v-model="dataCreatures"
    style="min-height: 24px;"
    :sort="false"
    :group="`creature-list`"
    ghost-class="ghost"
    draggable=".creature"
    handle=".handle"
    item-key="_id"
    @change="draggableChange"
  >
    <template #item="{ element: creature }">
      <creature-list-tile
        class="creature"
        :model="creature"
        :selection="selection"
        :is-selected="selectedCreature === creature._id || selectedCreatures.has(creature._id)"
        v-bind="selection ? {} : {to: creature.url}"
        :dense="dense"
        :data-id="dense ? undefined : creature._id"
        @click="$emit('creature-selected', creature._id)"
      />
    </template>
  </draggable>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import draggable from 'vuedraggable';
import CreatureListTile from '/imports/client/ui/creature/creatureList/CreatureListTile.vue';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods.js/moveCreatureToFolder';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  creatures: {
    type: Array,
    required: true,
  },
  folderId: {
    type: String,
    default: null,
  },
  selection: Boolean,
  selectedCreature: {
    type: String,
    default: undefined,
  },
  selectedCreatures: {
    type: Set,
    default: () => new Set(),
  },
  dense: Boolean,
});

const emit = defineEmits(['creature-selected', 'creatureSelected']);

const dataCreatures = ref(props.creatures || []);

watch(
  () => props.creatures,
  (newValue) => {
    dataCreatures.value = newValue;
  }
);

onMounted(() => {
  dataCreatures.value = props.creatures;
});

async function draggableChange({ added, moved }) {
  const event = added || moved;
  if (event) {
    const doc = event.element;
    try {
      await moveCreatureToFolder.callAsync({
        creatureId: doc._id,
        folderId: props.folderId,
      });
    } catch (error) {
      console.error(error);
      snackbar({ text: error.reason });
    }
  }
}

function selectionChange(index) {
  emit('creatureSelected', dataCreatures.value[index]._id);
}

defineExpose({
  selectionChange,
});
</script>

<style lang="css" scoped>
</style>
