<template>
  <div class="buff-viewer">
    <v-row dense>
      <property-field
        mono
        name="Variable name"
        :value="model.variableName"
      />
      <property-field
        name="Calculation"
        :value="model.calculation"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>
