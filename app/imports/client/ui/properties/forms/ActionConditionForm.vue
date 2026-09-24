<template>
  <v-row dense>
    <v-col
      cols="12"
      md="6"
    >
      <computed-field
        label="Condition"
        hint="This must be true for the action to be taken"
        :model="model.condition"
        :error-messages="errors.condition"
        @change="({path, value, ack}) =>
          $emit('change', {path: ['condition', ...path], value, ack})"
      />
    </v-col>
    <v-col
      cols="12"
      md="6"
    >
      <text-field
        label="Condition error text"
        :value="model.conditionNote"
        :error-messages="errors.conditionNote"
        @change="(value, ack) => $emit('change', {path: ['conditionNote'], value, ack})"
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

defineEmits(['change']);

</script>
