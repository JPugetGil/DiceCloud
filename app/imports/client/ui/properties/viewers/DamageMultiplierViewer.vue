<template>
  <div>
    <v-row dense>
      <property-field
        :name="$t('viewers.value')"
        :value="operation"
      />
      <property-field
        :name="$t('viewers.damageTypes')"
        wrap
      >
        <v-chip
          v-for="(damageType, index) in model.damageTypes"
          :key="index"
          class="mt-1 mr-1"
          :model-value="true"
          variant="outlined"
          size="small"
          label
        >
          {{ damageType }}
        </v-chip>
      </property-field>
      <property-field
        v-if="model.includeTags && model.includeTags.length"
        :name="$t('viewers.damageTagsRequired')"
        wrap
      >
        <v-chip
          v-for="(damageType, index) in model.includeTags"
          :key="index"
          class="mt-1 mr-1"
          :model-value="true"
          size="small"
          variant="outlined"
        >
          {{ damageType }}
        </v-chip>
      </property-field>
      <property-field
        v-if="model.excludeTags && model.excludeTags.length"
        :name="$t('viewers.damageTagsExcluded')"
        wrap
      >
        <v-chip
          v-for="(damageType, index) in model.excludeTags"
          :key="index"
          class="mt-1 mr-1"
          :model-value="true"
          size="small"
          variant="outlined"
        >
          {{ damageType }}
        </v-chip>
      </property-field>
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const operation = computed(() => {
  switch (props.model.value) {
    case 0: return t('damageMultipliers.immunity');
    case 0.5: return t('damageMultipliers.resistance');
    case 2: return t('damageMultipliers.vulnerability');
    default: return '';
  }
});
</script>

<style lang="css" scoped>

</style>
