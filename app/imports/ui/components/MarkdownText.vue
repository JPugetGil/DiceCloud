<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="markdown w-100"
    @click="e => $emit('click', e)"
    v-html="compiledMarkdown"
  />
</template>

<script setup lang="js">
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import markdownToHtml from '/imports/ui/utility/markdownToHtml';

const props = defineProps({
  markdown: {
    type: String,
    default: undefined,
  },
});

defineEmits(['click']);

const compiledMarkdown = computed(() => {
  if (!props.markdown) return;
  return DOMPurify.sanitize(markdownToHtml(props.markdown));
});
</script>
