<template>
  <div class="buff-viewer">
    <v-row dense>
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
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>
