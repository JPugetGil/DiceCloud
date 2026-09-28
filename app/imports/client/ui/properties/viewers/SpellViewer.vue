<template>
  <action-viewer
    :model="model"
    class="spell-viewer"
  >
    <property-field
      :name="$t('forms.spell.school')"
      :value="model.school"
    />
    <property-field
      :name="$t('forms.level')"
      :value="levelText"
    />
    <property-field
      :name="$t('printed.castingTimeName')"
      :value="model.castingTime"
    />
    <property-field
      :name="$t('forms.spell.range')"
      :value="model.range"
    />
    <property-field
      :name="$t('viewers.components')"
      :value="spellComponents"
    />
    <property-field
      :name="$t('viewers.duration')"
      :value="model.duration"
    />
  </action-viewer>
</template>

<script setup>
import { computed } from 'vue';
import ActionViewer from './ActionViewer.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
  if (props.model.ritual) components.push(t('spellComponents.ritual'));
  if (props.model.concentration) components.push(t('spellComponents.concentration'));
  if (props.model.verbal) components.push(t('spellComponents.verbal'));
  if (props.model.somatic) components.push(t('spellComponents.somatic'));
  if (props.model.material) components.push(t('viewers.materialWith', { material: props.model.material }));
  return components.join(', ');
});
</script>

<style lang="css" scoped>

</style>
