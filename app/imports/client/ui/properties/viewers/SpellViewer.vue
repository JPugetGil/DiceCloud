<template>
  <action-viewer
    :model="model"
    class="spell-viewer"
  >
    <property-field
      name="School"
      :value="model.school"
    />
    <property-field
      name="Level"
      :value="levelText"
    />
    <property-field
      name="Casting time"
      :value="model.castingTime"
    />
    <property-field
      name="Range"
      :value="model.range"
    />
    <property-field
      name="Components"
      :value="spellComponents"
    />
    <property-field
      name="Duration"
      :value="model.duration"
    />
  </action-viewer>
</template>

<script setup>
import { computed } from 'vue';
import ActionViewer from './ActionViewer.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const levelText = computed(() => {
  return levelText[props.model.level]
});

const spellComponents = computed(() => {
  let components = [];
  if (props.model.ritual) components.push('Ritual');
  if (props.model.concentration) components.push('Concentration');
  if (props.model.verbal) components.push('Verbal');
  if (props.model.somatic) components.push('Somatic');
  if (props.model.material) components.push(`Material (${props.model.material})`);
  return components.join(', ');
});
</script>

<style lang="css" scoped>

</style>
