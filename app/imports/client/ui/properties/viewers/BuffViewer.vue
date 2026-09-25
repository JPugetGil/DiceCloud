<template>
  <div class="buff-viewer">
    <!--<property-field
      :name="$t('viewers.duration')"
      :value="model.duration"
    />-->
    <v-row dense>
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
      />
    </v-row>
    <v-row dense>
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
.ability-value {
  font-weight: 600;
  font-size: 24px !important;
  color: rgba(0, 0, 0, 0.54);
}

.mod,
.ability-value {
  text-align: center;
  width: 100%;
}

.attribute-value {
  text-align: center;
}
</style>
