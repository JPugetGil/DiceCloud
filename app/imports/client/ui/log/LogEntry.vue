<template>
  <v-card
    class="ma-2 log-entry"
  >
    <v-card-title v-if="showName && model.creatureName">
      {{ model.creatureName }}
    </v-card-title>
    <v-card-text
      v-if="model.text || (model.content && model.content.length)"
      class="pa-2"
    >
      <log-content :model="model.content" />
    </v-card-text>
  </v-card>
</template>

<script setup>
import LogContent from '/imports/client/ui/log/LogContent.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
  showName: Boolean,
});
</script>

<style scoped>
/*
 * The log is a scrolling flex column. Flex items may shrink to their content's
 * height, but not below it, unless they hide overflow; Vuetify 3's cards do
 * (Vuetify 2's did not), so once the log filled up every entry shrank and cut
 * its text off. Entries keep their height and the log scrolls instead.
 */
.log-entry {
  flex-shrink: 0;
}
</style>
