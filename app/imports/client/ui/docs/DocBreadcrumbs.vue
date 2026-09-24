<template>
  <v-breadcrumbs
    :items="items"
    divider=">"
  />
</template>

<script setup>
import { computed } from 'vue';
import Docs from '/imports/api/docs/Docs';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

const props = defineProps({
  doc: {
    type: Object,
    default: undefined,
  },
});

const items = computed(() => {
  const items = [{
    title: 'Docs',
    to: '/docs',
    exact: true,
  }];
  if (!props.doc) return items;

  const ancestors = Docs.find({
    ...getFilter.ancestors(props.doc)
  }).fetch();
      
  ancestors.forEach(a => {
    items.push({
      title: a.name,
      to: a.href,
      exact: true,
    });
  });
      
  items.push({
    title: props.doc.name,
    to: props.doc.href,
    exact: true,
  });
  return items;
});
</script>