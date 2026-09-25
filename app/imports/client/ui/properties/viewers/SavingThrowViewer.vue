<template>
  <div class="saving-throw-viewer">
    <v-row dense>
      <property-field
        :name="$t('check.dc')"
        large
        center
        :calculation="model.dc"
      />
      <property-field
        :name="$t('forms.save')"
        mono
        :value="model.stat"
      />
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
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
