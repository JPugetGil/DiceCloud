<template>
  <div class="point-buy-viewer">
    <v-row dense>
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
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});





</script>
