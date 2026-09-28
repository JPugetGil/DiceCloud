<template>
  <div
    v-if="insufficient"
    class="d-flex flex-1-1 align-center justify-start text-error"
  >
    <div
      class="mr-2 text-no-wrap text-truncate"
      style="min-width: 24px; text-align: center;"
    >
      {{ model.conditionNote || (model.condition && model.condition.calculation) || $t('cards.noCondition') }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
});

const insufficient = computed(() => {
  return !props.model.condition?.value;
});
</script>
