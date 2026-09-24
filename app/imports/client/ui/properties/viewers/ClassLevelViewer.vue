<template>
  <div class="class-level-viewer">
    <v-row
      dense
      justify="center"
    >
      <property-field
        name="Level"
        large
        center
        :value="model.level"
      />
      <property-field
        name="Variable Name"
        mono
        :value="model.variableName"
      />
      <property-field
        v-if="!context.creatureId"
        name="Condition"
        mono
        :value="model.slotFillerCondition"
      />
      <property-description
        name="Description"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { inject } from 'vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

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
