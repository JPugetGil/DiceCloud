<template>
  <v-btn
    variant="text"
    :icon="!text"
    :data-id="randomId"
    v-bind="$attrs"
    @click="openArchive"
  >
    <template v-if="text">
      Archive Characters
    </template>
    <v-icon :end="text">
      mdi-archive
    </v-icon>
  </v-btn>
</template>

<script setup>
import { Random } from 'meteor/random';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

defineProps({
  text: Boolean,
});

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
