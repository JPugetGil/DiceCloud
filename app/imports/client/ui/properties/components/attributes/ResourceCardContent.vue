<template>
  <div class="d-flex flex-1-1">
    <div class="buttons d-flex flex-1-1 flex-column justify-center pl-3">
      <smart-btn
        variant="text"
        icon
        size="small"
        :disabled="(optimisticValue >= model.total && !model.ignoreUpperLimit) || context.editPermission === false"
        @clicks="(times, ack) => increment(times, ack)"
        @click="optimisticIncrement += 1"
      >
        <v-icon>mdi-chevron-up</v-icon>
      </smart-btn>
      <smart-btn
        variant="text"
        icon
        size="small"
        :disabled="(optimisticValue <= 0 && !model.ignoreLowerLimit) || context.editPermission === false"
        @clicks="(times, ack) => increment(-1 * times, ack)"
        @click="optimisticIncrement -= 1"
      >
        <v-icon>mdi-chevron-down</v-icon>
      </smart-btn>
    </div>
    <div class="d-flex flex-1-1 align-center value pl-2 pr-3">
      <div class="text-h4">
        {{ optimisticValue }}
      </div>
      <div
        v-if="model.total !== 0"
        class="text-h6 ml-2 max-value"
      >
        /{{ model.total }}
      </div>
    </div>
    <div
      class="content d-flex flex-1-1 align-center pr-3"
      @click="click"
      @mouseover="$emit('mouseover')"
      @mouseleave="$emit('mouseleave')"
    >
      <div class="text-truncate ">
        {{ model.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, ref, computed, watch } from 'vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  hover: {
    type: Boolean,
  },
});

const emit = defineEmits(['mouseover', 'mouseleave', 'click', 'change']);

const context = inject('context', {});

const optimisticIncrement = ref(0);

const optimisticValue = computed(() => {
  return props.model?.value + optimisticIncrement.value;
});

function click(e) {
  emit('click', e);
}

function increment(value, ack) {
  emit('change', { type: 'increment', value, ack })
}

watch(() => props.model.value, () => {
  optimisticIncrement.value = 0;
});
</script>

<style lang="css" scoped>
.buttons,
.value {
  flex-shrink: 0;
  flex-grow: 0;
}
.buttons>.v-btn {
  margin: 0;
}
.content {
  cursor: pointer;
}
.max-value {
  color: rgba(0, 0, 0, .54);
}
.v-theme--dark .max-value {
  color: rgba(255, 255, 255, 0.54);
}
</style>