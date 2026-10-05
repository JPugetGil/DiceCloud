<template>
  <div class="log-content">
    <div
      v-for="(content, index) in filteredModel"
      :key="index"
      class="content-line"
    >
      <!-- The line's result heads it, larger than the dice that made it (D6) -->
      <div
        v-if="content.total !== undefined"
        class="d-flex align-baseline flex-wrap gc-2"
      >
        <h4
          class="content-name my-0 flex-1-1"
          :class="logLineTone(content) && `text-${logLineTone(content)}`"
        >
          {{ content.name }}
        </h4>
        <span class="log-line-total">
          <span class="log-line-total__value text-headline-small">{{ content.total }}</span>
          <span
            v-if="content.totalLabel"
            class="text-body-small text-medium-emphasis ml-1"
          >{{ content.totalLabel }}</span>
        </span>
      </div>
      <h4
        v-else
        class="content-name my-0"
        :class="logLineTone(content) && `text-${logLineTone(content)}`"
        style="min-height: 12px;"
      >
        {{ content.name }}
      </h4>
      <markdown-text
        v-if="content.value"
        class="content-value"
        :class="{ 'text-body-small': content.total !== undefined || content.detail }"
        :markdown="content.value"
        dice
      />
      <div
        v-else-if="content.total === undefined"
        style="min-height: 12px;"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';
import { logLineTone } from '/imports/api/creature/log/logMessages';
import { translateLine } from '/imports/ui/log/translateLog';
import { withTotals } from '/imports/ui/log/logTotals';

const props = defineProps({
  model: {
    type: Array,
    default: () => [],
  },
});

// In the reader's language: the engine's lines carry their messages (UX5)
const filteredModel = computed(() => {
  return withTotals(props.model.filter(content => !content.silenced).map(translateLine));
});
</script>

<style lang="css" scoped>
.content-line {
  min-height: 24px;
  margin-top: 8px;
  margin-bottom: 2px;
}
</style>

<style lang="css">
  .log-content .content-value > :last-child {
    margin-bottom: 0;
  }
</style>
