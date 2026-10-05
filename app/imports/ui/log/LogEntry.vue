<template>
  <v-card
    class="ma-2 log-entry flex-shrink-0"
    :class="{ 'log-fresh': fresh }"
  >
    <v-card-text
      v-if="model.text || (model.content && model.content.length)"
      class="pa-2"
    >
      <log-content :model="model.content" />
    </v-card-text>
  </v-card>
</template>

<script setup>
import LogContent from '/imports/ui/log/LogContent.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
  // Written since the log opened: its dice roll in
  fresh: Boolean,
});
</script>

<style scoped>
/*
 * The log is a scrolling flex column. Flex items may shrink to their content's
 * height, but not below it, unless they hide overflow; Vuetify's cards do, so
 * once the log filled up every entry would shrink and cut its text off.
 * Entries keep their height and the log scrolls instead.
 */
</style>
