<template>
  <div class="point-buy-viewer">
    <v-row density="compact">
      <property-field
        v-for="row in model.values"
        :key="row._id"
        :name="row.name"
        :value="row.value"
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
