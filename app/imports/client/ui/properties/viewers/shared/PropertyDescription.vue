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
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

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

<style lang="css">
.computed {
  display: inline-block;
}

.computed.symbols-are-errors .math-symbol {
  color: red;
}

.computed.code {
  font-family: monospace, monospace;
}

.computed .math-binary-operator {
  margin: 0 6px;
}
</style>
