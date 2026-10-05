<template>
  <div class="character-grid">
    <template
      v-for="section in sections"
      :key="section.key"
    >
      <div
        v-if="section.folder"
        class="d-flex align-center ga-1 mt-4 mb-1"
        :data-id="`character-grid-folder-${section.folder._id}`"
      >
        <v-icon
          icon="mdi-folder-outline"
          class="text-medium-emphasis me-1"
        />
        <v-text-field
          v-if="renamingId === section.folder._id"
          v-model="newName"
          :aria-label="$t('characterList.folderName')"
          variant="outlined"
          density="compact"
          hide-details
          autofocus
          class="character-grid__name-field"
          data-id="folder-name-field"
          @keydown.enter="rename(section.folder)"
          @keydown.esc="renamingId = undefined"
          @blur="rename(section.folder)"
        />
        <h2
          v-else
          class="text-title-medium my-0 text-truncate"
        >
          {{ section.folder.name }}
        </h2>
        <v-btn
          v-for="action in folderActions(section.folder)"
          :key="action.key"
          variant="text"
          icon
          size="small"
          :to="action.to"
          :aria-label="action.label"
          :data-id="`${action.key}-${section.folder._id}`"
          @click="action.run?.()"
        >
          <v-icon>{{ action.icon }}</v-icon>
          <v-tooltip
            activator="parent"
            location="top"
            :text="action.label"
          />
        </v-btn>
      </div>
      <!--
        A character is dragged by its card. Sortable follows the pointer
        itself: the browser's own drag took the card's link as a URL. On a
        touch screen, a long press starts it, so that the page still scrolls
      -->
      <draggable
        :model-value="section.creatures"
        item-key="_id"
        group="character-grid"
        :sort="false"
        :force-fallback="true"
        :fallback-tolerance="4"
        :delay="250"
        :delay-on-touch-only="true"
        ghost-class="character-grid__ghost"
        class="character-grid__cards"
        :class="{ 'character-grid__cards--dragging': draggingFrom !== undefined }"
        :data-id="`character-grid-${section.folder?._id || 'no-folder'}`"
        @start="draggingFrom = section.folder?._id || null"
        @end="dragEnded"
        @change="event => dropped(event, section.folder)"
      >
        <template #item="{ element: creature }">
          <div
            class="character-grid__item"
            @click.capture="swallowClickAfterDrag"
          >
            <v-card
              :to="creature.url"
              class="fill-height d-flex flex-column"
              :data-id="`character-card-${creature._id}`"
            >
              <v-img
                v-if="creature.picture || creature.avatarPicture"
                :src="creature.picture || creature.avatarPicture"
                :alt="creature.name"
                :aspect-ratio="4 / 5"
                cover
                position="top"
                class="flex-grow-0"
              />
              <v-responsive
                v-else
                :aspect-ratio="4 / 5"
                class="flex-grow-0"
              >
                <v-sheet
                  v-bind="creature.color ? userSurface(creature.color) : { color: 'surface-light' }"
                  class="fill-height d-flex align-center justify-center text-display-medium"
                >
                  {{ creature.initial }}
                </v-sheet>
              </v-responsive>
              <v-card-item class="align-start">
                <v-card-title class="text-title-medium text-wrap">
                  {{ creature.name }}
                </v-card-title>
                <v-card-subtitle class="text-wrap">
                  {{ creature.levelText }}
                </v-card-subtitle>
                <template #append>
                  <shared-icon :model="creature" />
                </template>
              </v-card-item>
            </v-card>
            <!-- Beside the card's link, not in it -->
            <div class="character-grid__menu">
              <move-to-folder-menu
                :creature="creature"
                :folder-id="section.folder?._id"
              />
            </div>
          </div>
        </template>
        <template
          v-if="!section.creatures.length && (section.folder || dropsOutOfFolder)"
          #footer
        >
          <div class="character-grid__empty text-body-medium text-medium-emphasis">
            <template v-if="section.folder">
              {{ $t('characterList.emptyFolder') }}
            </template>
            <template v-else>
              <v-icon
                icon="mdi-folder-remove-outline"
                class="me-2"
              />
              {{ $t('characterList.dropOutOfFolder') }}
            </template>
          </div>
        </template>
      </draggable>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import draggable from 'vuedraggable';
import { useI18n } from 'vue-i18n';
import SharedIcon from '/imports/ui/components/SharedIcon.vue';
import useUserSurface from '/imports/ui/composables/useUserSurface';
import MoveToFolderMenu from '/imports/ui/creature/creatureList/MoveToFolderMenu.vue';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods/moveCreatureToFolder';
import updateCreatureFolderName from '/imports/api/creature/creatureFolders/methods/updateCreatureFolderName';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

const props = defineProps({
  creatures: {
    type: Array,
    default: () => [],
  },
  folders: {
    type: Array,
    default: () => [],
  },
  // While searching, folders without a match are left out
  searching: Boolean,
});

const { t } = useI18n();

// The characters in no folder, then each folder's
const sections = computed(() => [
  { key: 'no-folder', creatures: props.creatures },
  ...props.folders
    .filter(folder => !props.searching || folder.creatures.length)
    .map(folder => ({ key: folder._id, folder, creatures: folder.creatures })),
]);

function folderActions(folder) {
  return [{
    key: 'party-board',
    icon: 'mdi-view-dashboard-outline',
    label: t('party.openBoard'),
    to: `/party/${folder._id}`,
  }, {
    key: 'rename-folder',
    icon: 'mdi-pencil-outline',
    label: t('characterList.renameFolder'),
    run: () => {
      newName.value = folder.name;
      renamingId.value = folder._id;
    },
  }, {
    key: 'delete-folder',
    icon: 'mdi-delete-outline',
    label: t('characterList.deleteFolder'),
    run: () => removeFolder(folder),
  }];
}

// Drag and drop: the folder the dragged character comes from (null for none)
const draggingFrom = ref(undefined);
// Somewhere to drop a character out of its folder when no character is out
const dropsOutOfFolder = computed(() => !!draggingFrom.value);

async function dropped({ added }, folder) {
  if (!added) return;
  try {
    await moveCreatureToFolder.callAsync({
      creatureId: added.element._id,
      folderId: folder?._id || null,
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}

// The click that ends a drag would otherwise open the character's sheet
let justDragged = false;
function dragEnded() {
  draggingFrom.value = undefined;
  justDragged = true;
  setTimeout(() => justDragged = false);
}
function swallowClickAfterDrag(event) {
  if (!justDragged) return;
  event.preventDefault();
  event.stopPropagation();
}

// Folders
const renamingId = ref(undefined);
const newName = ref('');

async function rename(folder) {
  if (renamingId.value !== folder._id) return;
  renamingId.value = undefined;
  const name = newName.value.trim();
  if (!name || name === folder.name) return;
  try {
    await updateCreatureFolderName.callAsync({ _id: folder._id, name });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}

async function removeFolder(folder) {
  try {
    await removeCreatureFolder.callAsync({ _id: folder._id });
    snackbar({ text: t('characterList.folderDeleted', { name: folder.name }) });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}
</script>

<style scoped>
.character-grid__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  border-radius: 12px;
}
/* Where a dragged character can go, without moving the cards around */
.character-grid__cards--dragging {
  outline: 2px dashed rgba(var(--v-border-color), 0.38);
  outline-offset: 4px;
  min-height: 48px;
}
.character-grid__item {
  position: relative;
}
.character-grid__menu {
  position: absolute;
  top: 4px;
  right: 4px;
  border-radius: 50%;
  background: rgba(var(--v-theme-surface), 0.85);
}
.character-grid__ghost {
  opacity: 0.4;
}
.character-grid__empty {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  padding: 8px 0;
}
.character-grid__name-field {
  max-width: 320px;
}
</style>
