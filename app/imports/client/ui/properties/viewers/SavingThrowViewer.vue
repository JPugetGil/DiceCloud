<template>
  <div class="saving-throw-viewer">
    <v-row dense>
      <property-field
        name="DC"
        large
        center
        :calculation="model.dc"
      />
      <property-field
        name="Save"
        mono
        :value="model.stat"
      />
      <property-field
        v-if="model.target === 'self'"
        name="Target"
        value="Self"
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
