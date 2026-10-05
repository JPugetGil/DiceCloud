<template>
  <v-tooltip
    location="top"
    open-delay="600"
    max-width="360"
    :disabled="!condition.description"
  >
    <template #activator="{ props: tooltip }">
      <!--
        A toggle button: on a span without a role, aria-pressed means nothing.
        Its icon has its place whether it shows or not, so the chip keeps its
        width when it turns on (A6); while the server answers, the icon pulses
      -->
      <v-chip
        v-bind="tooltip"
        role="button"
        size="small"
        class="condition-chip"
        :class="{ 'condition-chip--on': on, 'condition-chip--pending': pending }"
        :variant="on ? 'tonal' : 'outlined'"
        :color="on ? 'warning' : undefined"
        :aria-pressed="on"
        :aria-busy="pending || undefined"
        :data-id="`condition-${condition._id}`"
        @click="$emit('toggle')"
      >
        <span
          class="condition-chip__icon"
          aria-hidden="true"
        >
          <v-icon
            size="16"
            icon="mdi-check"
          />
        </span>
        {{ condition.name }}
      </v-chip>
    </template>
    <markdown-text
      class="condition-description"
      :markdown="condition.description"
    />
  </v-tooltip>
</template>

<script setup>
import MarkdownText from '/imports/ui/components/MarkdownText.vue';

defineProps({
  // listConditions' condition
  condition: {
    type: Object,
    required: true,
  },
  // The character has it, or will once the server answers
  on: Boolean,
  // The server has not answered yet
  pending: Boolean,
});

defineEmits(['toggle']);
</script>

<style scoped>
.condition-chip__icon {
  display: inline-flex;
  width: 16px;
  margin-inline: -4px 4px;
  transform: scale(0);
  opacity: 0;
  transition:
    transform var(--motion-duration-short) var(--motion-easing-emphasized-accelerate),
    opacity var(--motion-duration-short) var(--motion-easing-emphasized-accelerate);
}

.condition-chip--on .condition-chip__icon {
  transform: scale(1);
  opacity: 1;
  transition-duration: var(--motion-duration-medium);
  transition-timing-function: var(--motion-easing-emphasized-decelerate);
}

/* Waiting for the server: the icon pulses, the chip stays as it will be */
.condition-chip--pending .condition-chip__icon {
  transform: scale(1);
  opacity: 1;
  animation: condition-chip-pending 1s var(--motion-easing-standard) infinite;
}

@keyframes condition-chip-pending {
  50% {
    opacity: 0.3;
  }
}

/* Reduced animations: the icon fades, without growing, and does not pulse */
.reduce-motion .condition-chip__icon {
  transform: none;
  transition: opacity var(--motion-duration-short) linear;
}

.reduce-motion .condition-chip--pending .condition-chip__icon {
  animation: none;
  opacity: 0.5;
}

.condition-description > :deep(:last-child) {
  margin-bottom: 0;
}
</style>
