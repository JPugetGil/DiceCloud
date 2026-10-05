<template>
  <v-btn
    v-bind="$attrs"
    :disabled="isDisabled"
    :loading="slow"
    :aria-busy="loading || undefined"
    @click.stop.prevent="click"
  >
    <slot />
  </v-btn>
</template>

<script setup>
import { ref, computed, inject, watch, onBeforeUnmount } from 'vue';
import { SLOW_MS } from '/imports/ui/utility/motion';
import { debounce as _debounce } from 'lodash';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  singleClick: Boolean,
  // The parent's @clicks listener, declared so that the button knows whether
  // anyone will acknowledge the clicks: Vue keeps a declared event's listener
  // out of $attrs. `emit('clicks')` still calls it.
  onClicks: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click', 'clicks']);

const context = inject('context', {});

const loading = ref(false);
const timesClicked = ref(0);

// Waiting for the server: a spinner only once the wait is long (A7)
const slow = ref(false);
let slowTimer;
watch(loading, isLoading => {
  clearTimeout(slowTimer);
  slow.value = false;
  if (isLoading) slowTimer = setTimeout(() => { slow.value = true; }, SLOW_MS);
});

const isDisabled = computed(() => {
  return context.editPermission === false || props.disabled;
});

const debounceTime = computed(() => {
  if (Number.isFinite(props.debounce)) {
    return props.debounce;
  } else if (Number.isFinite(context.debounceTime)) {
    return context.debounceTime;
  } else {
    return 400;
  }
});

const acknowledgeChange = (error) => {
  loading.value = false;
  if (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
};

const clicks = () => {
  if (!props.onClicks) return;
  loading.value = true;
  emit('clicks', timesClicked.value, acknowledgeChange);
  timesClicked.value = 0;
};

const debounceClicks = _debounce(clicks, debounceTime.value);

onBeforeUnmount(() => {
  debounceClicks.flush();
  clearTimeout(slowTimer);
});

const click = () => {
  if (props.singleClick) {
    // One click at a time: the button only looks busy once the wait is long
    if (loading.value) return;
    loading.value = true;
  } else {
    timesClicked.value += 1;
    debounceClicks();
  }
  emit('click', acknowledgeChange);
};
</script>
