<template>
  <div class="feature-form">
    <inline-computation-field
      :label="$t('forms.summary')"
      :hint="$t('forms.note.summaryHint')"
      :model="model.summary"
      :error-messages="errors['summary.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['summary', ...path], value, ack})"
    />

    <inline-computation-field
      :label="$t('common.description')"
      :hint="$t('forms.note.descriptionHint')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections
      v-if="$slots.default"
      type="note"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

defineEmits(['change']);

</script>
