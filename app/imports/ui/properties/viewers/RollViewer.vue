<template>
  <div class="roll-viewer">
    <v-row density="compact">
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        :name="$t('forms.roll.roll')"
        large
        center
        :calculation="model.roll"
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
