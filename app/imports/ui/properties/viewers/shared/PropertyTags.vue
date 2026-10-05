<template>
  <div
    v-if="tags.length"
    class="tags ma-2"
  >
    <span
      v-if="prefix"
      class="mx-1 text-label-medium"
    >
      {{ prefix }}
    </span>
    <v-chip
      v-for="(tag, i) in tags"
      :key="tag + i"
      class="mx-1"
    >
      {{ tag }}
    </v-chip>
  </div>
</template>

<script setup>
defineProps({
  tags: {
    type: Array,
    default: () => [],
  },
  prefix: {
    type: String,
    default: undefined,
  },
});
</script>

<style lang="css" scoped>
</style>
