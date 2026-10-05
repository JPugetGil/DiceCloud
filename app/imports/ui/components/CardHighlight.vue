<template>
  <div
    v-if="theme.isDark"
    class="overlay"
    :class="{active}"
  />
</template>

<script setup>
import useThemeState from '/imports/ui/composables/useThemeState';

defineProps({
  active: Boolean,
});

const theme = useThemeState();
</script>

<style lang="css" scoped>
  .overlay {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;
    background-color: #fff;
    opacity: 0;
    transition: opacity 0.1s linear;
  }
  .overlay.active {
    opacity: 0.08;
  }
</style>
