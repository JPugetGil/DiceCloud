<template>
  <div class="buff-viewer">
    <v-row density="compact">
      <property-field
        mono
        :name="$t('viewers.variableNameLower')"
        :value="model.variableName"
      />
      <property-field
        :name="$t('viewers.calculation')"
        :value="model.calculation"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>
