<template>
  <div>
    <v-row dense>
      <v-col cols="12">
        <text-field
          label="Variable name"
          :value="model.variableName"
          style="flex-basis: 300px;"
          hint="Use this name in calculations to reference this attribute"
          :error-messages="errors.variableName"
          @change="(value, ack) => change('variableName', value, ack)"
        />
      </v-col>
      <v-col cols="12">
        <text-field
          label="Value"
          hint="Calculation of the constant value, use 'text' for a string value, [1,2,3] for a matrix, or 123 for a number"
          :value="model.calculation"
          :error-messages="errors.calculation"
          @change="(value, ack) => change('calculation', value, ack)"
        />
        <calculation-error-list :errors="clientErrors" />
      </v-col>
    </v-row>
    <form-sections
      v-if="$slots.default"
      type="constant"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import CalculationErrorList from '/imports/client/ui/properties/forms/shared/CalculationErrorList.vue';
import { ConstantSchema } from '/imports/api/properties/Constants';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

const props = defineProps({
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

const clientErrors = computed(() => {
  let cleanModel = ConstantSchema.clean(props.model);
  return cleanModel.errors;
});

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>
</style>
