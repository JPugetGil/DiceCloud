<template>
  <div class="buff-viewer">
    <v-row density="compact">
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
      />
    </v-row>
    <v-row density="compact">
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

</script>
