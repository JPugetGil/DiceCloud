<template>
  <v-row density="compact">
    <v-col
      cols="12"
      md="6"
    >
      <smart-combobox
        :label="$t('forms.attributeLabel')"
        :hint="$t('forms.attributeConsumed.hint')"
        style="flex-basis: 300px;"
        :items="attributeList"
        :model-value="model.variableName"
        @change="(value, ack) => change('variableName', value, ack)"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
    >
      <computed-field
        :label="$t('forms.quantity')"
        :hint="$t('forms.attributeConsumed.quantityHint')"
        :model="model.quantity"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['quantity', ...path], value, ack})"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { useAttributeList } from '/imports/ui/properties/forms/shared/lists/useAttributeList';
import ComputedField from '/imports/ui/properties/forms/shared/ComputedField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['change']);

const attributeList = useAttributeList();

function change(field, value, ack) {
  emit('change', { path: [field], value, ack });
}
</script>
