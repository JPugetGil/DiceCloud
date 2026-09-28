<template>
  <div class="feature-viewer">
    <v-row dense>
      <property-description
        :name="$t('forms.summary')"
        :model="model.summary"
      />
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>

<style lang="css" scoped>

</style>
