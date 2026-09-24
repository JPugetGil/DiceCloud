<template>
  <v-navigation-drawer
    v-model="drawer"
    location="right"
  >
    <character-log :creature-id="route.params.id" />
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CharacterLog from '/imports/client/ui/log/CharacterLog.vue';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();

const route = useRoute();

const drawer = computed({
  get() {
    return appStore.rightDrawer;
  },
  set(value) {
    appStore.setRightDrawer(value);
  },
});
</script>

<style lang="css" scoped>
</style>
