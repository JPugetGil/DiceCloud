<template>
  <v-row dense>
    <v-col
      cols="12"
      md="6"
    >
      <text-field
        :label="$t('forms.itemConsumed.item')"
        :hint="$t('forms.itemConsumed.itemHint')"
        style="flex-basis: 300px;"
        :value="model.tag"
        :error-messages="errors.tag"
        @change="(value, ack) => change('tag', value, ack)"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
    >
      <computed-field
        :label="$t('forms.quantity')"
        :hint="$t('forms.itemConsumed.quantityHint')"
        style="flex-basis: 300px;"
        :model="model.quantity"
        :error-messages="errors.quantity"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['quantity', ...path], value, ack})"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';

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

const emit = defineEmits(['change']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
