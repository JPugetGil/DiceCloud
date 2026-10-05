<template>
  <div
    class="value-change-summary"
    role="status"
  >
    <transition name="value-change-summary">
      <v-chip
        v-if="changeSummary"
        :key="changeSummary.id"
        variant="flat"
        color="surface-variant"
        prepend-icon="mdi-swap-vertical"
        data-id="value-change-summary"
      >
        {{ $t('sheet.valuesRecalculated', { count: changeSummary.count }) }}
      </v-chip>
    </transition>
  </div>
</template>

<script setup>
import { changeSummary } from '/imports/ui/composables/useValueChange';

/**
 * When many values change at once (the whole character recomputed), one chip
 * says so, instead of the sheet flashing all over (A5)
 */
</script>

<style scoped>
.value-change-summary {
  position: fixed;
  top: calc(var(--v-layout-top) + 8px);
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 1005;
}

.value-change-summary-enter-active,
.value-change-summary-leave-active {
  transition: opacity var(--motion-duration-short) var(--motion-easing-standard);
}

.value-change-summary-enter-from,
.value-change-summary-leave-to {
  opacity: 0;
}
</style>
