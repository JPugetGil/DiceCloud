<template>
  <!--
    The sheet's shape while it loads (A9): the combat summary, then cards in
    columns, as the Stats tab lays them out. Hidden from screen readers, which
    hear the busy region instead
  -->
  <div
    class="sheet-skeleton bg-page fill-height pa-2 pa-sm-4"
    data-id="sheet-skeleton"
  >
    <div
      class="sheet-skeleton__card sheet-skeleton__summary mb-2 mb-sm-4"
      aria-hidden="true"
    >
      <div class="sheet-skeleton__bar w-25" />
      <div class="sheet-skeleton__bar sheet-skeleton__bar--value" />
      <div class="sheet-skeleton__bar sheet-skeleton__bar--track" />
    </div>
    <div
      class="sheet-skeleton__columns"
      aria-hidden="true"
    >
      <div
        v-for="(lines, index) in CARDS"
        :key="index"
        class="sheet-skeleton__card mb-2 mb-sm-4"
      >
        <div
          v-for="line in lines"
          :key="line"
          class="sheet-skeleton__bar"
          :style="{ width: `${line}%` }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// The width of each line of each card, in percent
const CARDS = [
  [40, 90, 75],
  [55, 85, 85, 60],
  [35, 70],
  [50, 80, 80, 80, 65],
  [45, 90, 70],
  [60, 75, 75, 50],
];
</script>

<style scoped>
.sheet-skeleton__columns {
  column-width: 300px;
  column-gap: 16px;
}

.sheet-skeleton__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  break-inside: avoid;
}

.sheet-skeleton__bar {
  height: 12px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  animation: sheet-skeleton-pulse 1.5s var(--motion-easing-standard) infinite;
}

.sheet-skeleton__bar--value {
  width: 96px;
  height: 36px;
}

.sheet-skeleton__bar--track {
  height: 8px;
}

@keyframes sheet-skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}

.reduce-motion .sheet-skeleton__bar {
  animation: none;
}
</style>
