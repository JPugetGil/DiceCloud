<template>
  <!--
    Its height is where a character is dropped out of a folder. The compact
    sidebar list has no drag handles: it keeps none, or an empty list left a
    gap above the folders
  -->
  <!--
    forceFallback: Sortable follows the pointer itself. With the browser's
    drag and drop, the tile's link was dragged as a URL in place of the tile,
    and nothing was ever dropped
  -->
  <draggable
    v-model="dataCreatures"
    :style="{ minHeight: dense ? undefined : '24px' }"
    :sort="false"
    :group="`creature-list`"
    :force-fallback="true"
    ghost-class="ghost"
    draggable=".creature"
    handle=".handle"
    item-key="_id"
    @start="emit('dragging', folderId)"
    @end="emit('dragging', undefined)"
    @change="draggableChange"
  >
    <template #item="{ element: creature }">
      <creature-list-tile
        class="creature"
        :model="creature"
        :selection="selection"
        :is-selected="selectedCreature === creature._id"
        v-bind="selection ? {} : {to: creature.url}"
        :dense="dense"
        :data-id="dense ? undefined : creature._id"
        :folder-id="folderId || undefined"
        @click="$emit('creature-selected', creature._id)"
      />
    </template>
    <template
      v-if="dropHint"
      #footer
    >
      <div
        class="creature-list__drop-hint text-body-medium text-medium-emphasis"
        data-id="no-folder-drop-zone"
      >
        <v-icon
          icon="mdi-folder-remove-outline"
          class="me-2"
        />
        {{ $t('characterList.dropOutOfFolder') }}
      </div>
    </template>
  </draggable>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import draggable from 'vuedraggable';
import CreatureListTile from '/imports/ui/creature/creatureList/CreatureListTile.vue';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods/moveCreatureToFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

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
  dense: Boolean,
  // Shows where a character dragged out of its folder is dropped
  dropHint: Boolean,
});

// dragging: the folder of the character being dragged (null for none), then
// undefined once it is dropped
const emit = defineEmits(['creature-selected', 'dragging']);

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
</script>

<style lang="css" scoped>
.creature-list__drop-hint {
  display: flex;
  align-items: center;
  margin: 4px 8px;
  padding: 12px 16px;
  border: 2px dashed rgba(var(--v-border-color), 0.38);
  border-radius: 12px;
}
</style>
