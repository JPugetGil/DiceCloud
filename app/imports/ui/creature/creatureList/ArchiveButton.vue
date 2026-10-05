<template>
  <v-btn
    variant="text"
    icon
    :data-id="randomId"
    :aria-label="$t('files.archivedCharacters')"
    v-bind="$attrs"
    @click="openArchive"
  >
    <v-icon>
      mdi-archive
    </v-icon>
    <v-tooltip
      activator="parent"
      location="bottom"
      :text="$t('files.archivedCharacters')"
    />
  </v-btn>
</template>

<script setup>
import { Random } from 'meteor/random';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const randomId = Random.id();

function openArchive() {
  dialogStackStore.pushDialogStack({
    component: 'archive-dialog',
    elementId: randomId,
  });
}
</script>

<style lang="css" scoped>
</style>
