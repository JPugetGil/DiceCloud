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
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  markdown: {
    type: String,
    default: undefined,
  },
});

defineEmits(['click']);

/*
 * Rendered markdown takes Vuetify's own styles: the Material type scale for
 * headings, spacing and border utilities for blocks, and the classes of
 * VDivider, VTable and VCode. markdown.css keeps what classes cannot express.
 */
const HEADINGS = {
  1: 'text-headline-large',
  2: 'text-headline-small',
  3: 'text-title-large',
  4: 'text-title-medium',
  5: 'text-title-small',
  6: 'text-label-large',
};
const LIST = 'mt-0 mb-4 ps-6';
const base = marked.Renderer.prototype;
// Adds classes to the element an html string starts with, if it is that tag
const addClass = (html, tag, classes) => html.replace(new RegExp(`^<${tag}\\b`), `<${tag} class="${classes}"`);

const renderer = new marked.Renderer();
Object.assign(renderer, {
  heading(text, level, ...rest) {
    const html = base.heading.call(this, text, level, ...rest);
    return addClass(html, `h${level}`, `${HEADINGS[level]} mt-6 mb-3`);
  },
  paragraph(text) {
    return `<p class="mt-0 mb-4">${text}</p>\n`;
  },
  list(body, ordered, start) {
    return addClass(base.list.call(this, body, ordered, start), ordered ? 'ol' : 'ul', LIST);
  },
  // A list nested in an item continues the item: no space after it
  listitem(text, ...rest) {
    return base.listitem.call(this, text.replaceAll(`class="${LIST}"`, 'class="my-0 ps-6"'), ...rest);
  },
  blockquote(quote) {
    return `<blockquote class="border-s-lg border-opacity-50 ps-4 mx-0 mt-0 mb-4">\n${quote}</blockquote>\n`;
  },
  hr() {
    return '<hr class="v-divider my-4">\n';
  },
  table(header, body) {
    return '<div class="v-table v-table--density-compact v-table--striped-odd mb-4">'
      + `<div class="v-table__wrapper">${base.table.call(this, header, body)}</div></div>\n`;
  },
  codespan(text) {
    return `<code class="v-code">${text}</code>`;
  },
  code(...args) {
    return addClass(base.code.apply(this, args), 'pre', 'v-code d-block px-3 py-2 mt-0 mb-4 overflow-x-auto');
  },
  link(...args) {
    return addClass(base.link.apply(this, args), 'a', 'text-primary');
  },
  image(...args) {
    return addClass(base.image.apply(this, args), 'img', 'my-2');
  },
});

const compiledMarkdown = computed(() => {
  if (!props.markdown) return;
  return DOMPurify.sanitize(marked(props.markdown, { renderer }));
});
</script>
