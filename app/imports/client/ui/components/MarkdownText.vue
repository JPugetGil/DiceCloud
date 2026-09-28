<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="markdown"
    @click="e => $emit('click', e)"
    v-html="compiledMarkdown"
  />
</template>

<script setup lang="js">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  markdown: {
    type: String,
    default: undefined,
  },
});

defineEmits(['click']);

const compiledMarkdown = computed(() => {
  if (!props.markdown) return;
  return DOMPurify.sanitize(marked(props.markdown));
});
</script>
