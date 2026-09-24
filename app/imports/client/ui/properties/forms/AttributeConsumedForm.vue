<template>
  <v-row dense>
    <v-col
      cols="12"
      md="6"
    >
      <smart-combobox
        label="Attribute"
        hint="The attribute variable name that will be consumed"
        style="flex-basis: 300px;"
        :items="attributeList"
        :value="model.variableName"
        :error-messages="errors.variableName"
        @change="(value, ack) => change('variableName', value, ack)"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
    >
      <computed-field
        label="Quantity"
        hint="How much of the attribute will be consumed. If this amount is not available in the attribute, the action can't be taken"
        :model="model.quantity"
        :error-messages="errors.quantity"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['quantity', ...path], value, ack})"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { useAttributeList } from '/imports/client/ui/properties/forms/shared/lists/useAttributeList';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const attributeList = useAttributeList();

function change(field, value, ack) {
  emit('change', { path: [field], value, ack });
}
</script>
