<template>
  <span
    v-if="changeKey && delta"
    :key="changeKey"
    class="health-delta text-label-large"
    :class="[delta < 0 ? 'bg-error' : 'bg-success', {
      'health-delta--centered': centered,
      'health-delta--beside': beside,
    }]"
    aria-hidden="true"
    data-id="health-delta"
  >
    {{ numberToSignedString(delta) }}
  </span>
</template>

<script setup>
import numberToSignedString from '/imports/api/utility/numberToSignedString';

/**
 * "−7" or "+5" over a health bar where its value changed: rises and fades
 * (DESIGN_SYSTEM.md, "Motion"). Each new `changeKey` starts it again; a
 * change within the same burst only updates the number.
 */
defineProps({
  delta: {
    type: Number,
    default: 0,
  },
  changeKey: {
    type: Number,
    default: 0,
  },
  // In the middle of the bar, when its value is written beside it rather
  // than on it; otherwise just right of the value, which it never covers
  centered: Boolean,
  // Just after what it sits in (the large hit points of CombatSummary)
  beside: Boolean,
});
</script>

<style scoped>
.health-delta {
  position: absolute;
  top: 50%;
  left: calc(50% + 44px);
  z-index: 1;
  padding: 0 8px;
  border-radius: 12px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  opacity: 0;
  translate: 0 -50%;
  animation: health-delta 900ms var(--motion-easing-standard) forwards;
}

.health-delta--centered {
  left: 50%;
  translate: -50% -50%;
}

.health-delta--beside {
  left: calc(100% + 8px);
}

.reduce-motion .health-delta {
  animation-name: health-delta-fade;
}

@keyframes health-delta {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  15% {
    opacity: 1;
    transform: translateY(-8px);
  }
  65% {
    opacity: 1;
    transform: translateY(-16px);
  }
  100% {
    opacity: 0;
    transform: translateY(-24px);
  }
}

@keyframes health-delta-fade {
  0%, 100% {
    opacity: 0;
  }
  15%, 65% {
    opacity: 1;
  }
}
</style>
