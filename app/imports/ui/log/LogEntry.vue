<template>
  <v-card
    class="ma-2 log-entry flex-shrink-0"
    :class="{
      'log-entry--held': held,
      'log-entry--new': fresh && !held,
      'log-fresh': fresh && !thrown,
    }"
    :data-id="`log-entry-${model._id}`"
  >
    <v-card-text
      v-if="model.text || (model.content && model.content.length)"
      class="pa-2"
    >
      <log-content :model="model.content" />
    </v-card-text>
    <log-undo
      v-if="model.received"
      :model="model"
      :can-edit="canEdit"
      :encounters="encounters"
    />
  </v-card>
</template>

<script setup>
import { computed } from 'vue';
import LogContent from '/imports/ui/log/LogContent.vue';
import LogUndo from '/imports/ui/log/LogUndo.vue';
import { throwPhase, wasThrown } from '/imports/ui/dice/diceTrayState';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  // Written since the log opened: it comes in, and its dice roll in
  fresh: Boolean,
  // For a received entry's "Undo" (LogUndo): whether the reader may edit
  // the creature, and the encounters under way of its parties
  canEdit: Boolean,
  encounters: {
    type: Array,
    default: () => [],
  },
});

// The dice tray is throwing its dice: it shows once they land, and they do
// not roll in a second time here
const held = computed(() => props.fresh && throwPhase(props.model._id) === 'flying');
const thrown = computed(() => props.fresh && wasThrown(props.model._id));
</script>

<style scoped>
/*
 * The log is a scrolling flex column. Flex items may shrink to their content's
 * height, but not below it, unless they hide overflow; Vuetify's cards do, so
 * once the log filled up every entry would shrink and cut its text off.
 * Entries keep their height and the log scrolls instead.
 *
 * Only the new entry animates (DESIGN_SYSTEM.md, "Motion"): the others are
 * not measured or moved.
 */
.log-entry--held {
  visibility: hidden;
}

.log-entry--new {
  animation: log-entry-in var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
}

.reduce-motion .log-entry--new {
  animation: log-entry-fade var(--motion-duration-short) var(--motion-easing-standard);
}

@keyframes log-entry-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes log-entry-fade {
  from {
    opacity: 0;
  }
}
</style>
