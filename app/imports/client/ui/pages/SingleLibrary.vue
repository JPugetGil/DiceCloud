<template>
  <single-card-layout>
    <library-and-node
      :library-id="route.params.id"
    />
  </single-card-layout>
</template>

<script setup lang="js">
import { watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import SingleCardLayout from '/imports/client/ui/layouts/SingleCardLayout.vue';
import LibraryAndNode from '/imports/client/ui/library/LibraryAndNode.vue';
import Libraries from '/imports/api/library/Libraries';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();

const route = useRoute();

const library = autorun(() => {
  const libraryId = route.params.id;
  if (!libraryId) return;
  return Libraries.findOne(libraryId, {fields: {name: 1}});
}).result;

watch(() => library.value?.name, (newName) => {
  appStore.setPageTitle(newName || 'Library');
});

onMounted(() => {
  appStore.setPageTitle(library.value?.name || 'Library');
});
</script>
