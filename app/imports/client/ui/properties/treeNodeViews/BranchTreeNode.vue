<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <property-icon
      v-if="!hideIcon"
      class="mr-2"
      :model="model"
      :color="model.color"
      :class="selected && 'text-primary'"
    />
    <div class="text-no-wrap text-truncate">
      {{ name }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const name = computed(() => {
  switch(props.model.branchType){
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
