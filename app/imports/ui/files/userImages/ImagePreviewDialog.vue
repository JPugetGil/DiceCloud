<template>
  <img
    class="preview-image v-sheet v-card elevation-2"
    :class="themeClasses"
    :src="href"
    @click="back"
  >
</template>

<script setup>
import { computed } from 'vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useThemeState from '/imports/ui/composables/useThemeState';

defineProps({
  href: {
    type: String,
    required: true,
  },
});

const theme = useThemeState();

const dialogStackStore = useDialogStackStore();

const themeClasses = computed(() => {
  return {
    'v-theme--dark': theme.isDark,
    'v-theme--light': !theme.isDark,
  }
});

function back() {
  dialogStackStore.popDialogStack();
}
</script>

<style lang="css" scoped>
.preview-image {
  max-height: 100%;
  max-width: 100%;
  cursor: zoom-out;
}
</style>
