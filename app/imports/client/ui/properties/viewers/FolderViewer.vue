<template>
  <div class="folder-viewer">
    <v-row
      dense
    >
      <property-field
        :name="$t('common.name')"
        :value="model.name"
      />
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
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
