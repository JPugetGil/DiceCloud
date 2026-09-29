<template>
  <div class="class-level-viewer">
    <v-row
      class="justify-center"
      density="compact"
    >
      <property-field
        :name="$t('forms.level')"
        large
        center
        :value="model.level"
      />
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        v-if="!context.creatureId"
        :name="$t('forms.condition')"
        mono
        :value="model.slotFillerCondition"
      />
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { inject } from 'vue';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});
</script>

<style lang="css" scoped>

</style>
