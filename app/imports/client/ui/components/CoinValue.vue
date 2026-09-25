<template>
  <div>
    <span
      v-if="coinValue.gp || value === 0"
    >
      {{ $t('coins.gp', { value: coinValue.gp }) }}
    </span>
    <span
      v-if="coinValue.sp || (coinValue.gp && coinValue.cp)"
    >
      {{ $t('coins.sp', { value: coinValue.sp }) }}
    </span>
    <span
      v-if="coinValue.cp"
    >
      {{ $t('coins.cp', { value: coinValue.cp }) }}
    </span>
  </div>
</template>

<script setup lang="js">
import { computed } from 'vue';
import valueToCoins from '/imports/client/ui/utility/valueToCoins';

const props = defineProps({
  value: {
    type: Number,
    default: undefined,
  },
});

const coinValue = computed(() => {
  return valueToCoins(props.value);
});
</script>

<style lang="css" scoped>
</style>
