<template>
  <div>
    <div
      class="d-flex flex-1-1 align-center justify-start"
      style="height:40px;"
    >
      <v-icon
        v-if="!hideIcon"
        class="mr-2"
        :color="model.color"
        :class="selected && 'text-primary'"
      >
        {{ icon }}
      </v-icon>
      <div class="text-no-wrap text-truncate">
        {{ model.damageType === 'healing'
          ? $t('treeNodes.healing', { amount: model.amount && model.amount.value })
          : $t('treeNodes.damage', { amount: model.amount && model.amount.value, type: damageTypeName(model.damageType) }) }}
        <span v-if="model.target === 'self'">{{ $t('treeNodes.toSelf') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { damageTypeName } from '/imports/client/ui/i18n';
import { computed } from 'vue';
import { getPropertyIcon } from '/imports/constants/PROPERTIES';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const icon = computed(() => {
  if (props.model.damageType === 'healing') {
    return 'mdi-hospital-box-outline'
  } else {
    return getPropertyIcon('damage');
  }
});
</script>
