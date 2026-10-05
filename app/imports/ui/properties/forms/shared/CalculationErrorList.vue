<template>
  <div
    v-if="computedErrors.length"
    class="error-list"
  >
    <v-slide-x-transition
      group
      hide-on-leave
    >
      <v-alert
        v-for="error in computedErrors"
        :key="error.message"
        :value="true"
        :icon="errorIcon(error.type)"
        :color="errorColor(error.type)"
        class="mb-2"
        density="compact"
        text
      >
        <pre class="my-0">{{ error.message }}</pre>
      </v-alert>
    </v-slide-x-transition>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  errors: {
    type: Array,
    default: undefined,
  },
});

const computedErrors = computed(() => {
  return props.errors || [];
});

function errorIcon(type) {
  if (type === 'subsitution'){
    return 'mdi-information';
  } else if (type === 'evaluation'){
    return 'mdi-alert-circle';
  } else {
    return 'mdi-alert'
  }
}

function errorColor(type) {
  if (type === 'subsitution'){
    return 'info';
  } else if (type === 'evaluation'){
    return 'warning';
  } else {
    return 'error'
  }
}
</script>

<style lang="css">
.error-list .v-alert__content{
  overflow-x: auto;
}
</style>
