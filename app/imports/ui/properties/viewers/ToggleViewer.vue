<template>
  <div class="toggle-viewer">
    <v-row density="compact">
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        v-if="model.disabled || model.enabled"
        :name="$t('viewers.state')"
        :value="model.enabled ? $t('forms.toggle.enabled') : $t('forms.toggle.disabled')"
      />
      <template v-else-if="model.condition">
        <property-field
          :name="$t('forms.condition')"
          :calculation="model.condition"
        />
        <property-target-tags
          :model="model"
        />
      </template>
    </v-row>
  </div>
</template>

<script setup>
import PropertyTargetTags from '/imports/ui/properties/viewers/shared/PropertyTargetTags.vue';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>
