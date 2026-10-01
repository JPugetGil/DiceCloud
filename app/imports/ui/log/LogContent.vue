<template>
  <div class="log-content">
    <div
      v-for="(content, index) in filteredModel"
      :key="index"
      class="content-line"
    >
      <h4
        class="content-name my-0"
        :class="{
          'text-success': content.name?.startsWith('Critical Hit'),
          'text-error': content.name?.startsWith('Critical Miss'),
        }"
        style="min-height: 12px;"
      >
        {{ content.name }}
      </h4>
      <markdown-text
        v-if="content.value"
        class="content-value"
        :markdown="content.value"
        dice
      />
      <div
        v-else
        style="min-height: 12px;"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';

const props = defineProps({
  model: {
    type: Array,
    default: () => [],
  },
  showSilenced: {
    type: Boolean,
    default: false,
  },
});

const filteredModel = computed(() => {
  return props.model.filter(content => !content.silenced || props.showSilenced);
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
