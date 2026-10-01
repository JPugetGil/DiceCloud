<template>
  <v-menu location="bottom end">
    <template #activator="{ props: activatorProps }">
      <!-- Prevented: the button may sit in a character's link -->
      <v-btn
        v-bind="activatorProps"
        variant="text"
        icon
        :size="size"
        :aria-label="$t('characterList.moveToFolder', { name: creature.name })"
        :data-id="`move-to-folder-${creature._id}`"
        @click.prevent
      >
        <v-icon>mdi-folder-move-outline</v-icon>
        <v-tooltip
          activator="parent"
          location="top"
          :text="$t('characterList.moveTo')"
        />
      </v-btn>
    </template>
    <v-list
      density="compact"
      data-id="move-to-folder-menu"
    >
      <v-list-subheader>{{ $t('characterList.moveTo') }}</v-list-subheader>
      <v-list-item
        v-if="folderId"
        prepend-icon="mdi-folder-remove-outline"
        :title="$t('characterList.noFolder')"
        @click="move(null)"
      />
      <v-list-item
        v-for="folder in folders"
        :key="folder._id"
        prepend-icon="mdi-folder-outline"
        :title="folder.name"
        :disabled="folder._id === folderId"
        :append-icon="folder._id === folderId ? 'mdi-check' : undefined"
        @click="move(folder)"
      />
      <v-list-item
        prepend-icon="mdi-folder-plus-outline"
        :title="$t('characterList.newFolder')"
        @click="moveToNewFolder"
      />
    </v-list>
  </v-menu>
</template>

<script setup>
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import insertCreatureFolder from '/imports/api/creature/creatureFolders/methods/insertCreatureFolder';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods/moveCreatureToFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * Moves a character to another of the user's folders, or out of any folder:
 * what drag and drop does, for those who do not find it or cannot drag
 */
const props = defineProps({
  creature: {
    type: Object,
    required: true,
  },
  // The folder the character is in, none for the characters in no folder
  folderId: {
    type: String,
    default: undefined,
  },
  size: {
    type: String,
    default: 'small',
  },
});

const { t } = useI18n();

const folders = autorun(() => CreatureFolders.find(
  { owner: Meteor.userId(), archived: { $ne: true } },
  { sort: { name: 1 }, fields: { name: 1 } },
).fetch()).result;

async function move(folder) {
  const creatureId = props.creature._id;
  const fromId = props.folderId || null;
  try {
    await moveCreatureToFolder.callAsync({ creatureId, folderId: folder?._id || null });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
    return;
  }
  snackbar({
    text: folder
      ? t('characterList.movedToFolder', { name: props.creature.name, folder: folder.name })
      : t('characterList.movedOutOfFolder', { name: props.creature.name }),
    callbackName: 'undo',
    callback: () => moveCreatureToFolder.callAsync({ creatureId, folderId: fromId })
      .catch(error => snackbar({ text: error.reason || error.message })),
  });
}

async function moveToNewFolder() {
  try {
    const _id = await insertCreatureFolder.callAsync();
    const folder = CreatureFolders.findOne(_id);
    await move(folder || { _id, name: '' });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}
</script>
