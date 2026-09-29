<template>
  <div class="note-viewer">
    <v-row density="compact">
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
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>

<style lang="css" scoped>

</style>
