<template>
  <div class="branch-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.branchType')"
        :value="name"
      />
      <property-field
        v-if="model.branchType === 'if'"
        :name="$t('forms.condition')"
        :calculation="model.condition"
      />
      <property-field
        v-else-if="model.branchType === 'index'"
        :name="$t('viewers.index')"
        :calculation="model.condition"
      />
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

const name = computed(() => {
  switch (props.model.branchType) {
    case 'if': return t('branchTypes.if');
    case 'hit': return t('branchTypes.hit');
    case 'miss': return t('branchTypes.miss');
    case 'failedSave': return t('branchTypes.failedSave');
    case 'successfulSave': return t('branchTypes.successfulSave');
    case 'eachTarget': return t('branchTypes.eachTarget');
    case 'random': return t('branchTypes.random');
    case 'index': return t('branchTypes.index');
    case 'choice': return t('branchTypes.choice');
    default: return '';
  }
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
