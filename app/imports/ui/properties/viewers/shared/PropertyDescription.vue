<template>
  <markdown-text
    v-if="text && model"
    :markdown="textValue"
  />
  <property-field
    v-else-if="model && textValue"
    :name="name"
    :cols="{cols: 12}"
  >
    <markdown-text :markdown="textValue" />
  </property-field>
</template>

<script setup>
import { computed } from 'vue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';

const props = defineProps({
  model: {
    type: Object,
    default: undefined,
  },
  name: {
    type: String,
    default: undefined,
  },
  text: Boolean,
});

const textValue = computed(() => {
  if (!props.model) return;
  if (typeof props.model.value === 'string') {
    return props.model.value;
  } else {
    return props.model.text;
  }
});
</script>
