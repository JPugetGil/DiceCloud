<template>
  <v-btn
    v-bind="$attrs"
    :disabled="isDisabled"
    :loading="loading"
    @click.stop.prevent="click"
  >
    <slot />
  </v-btn>
</template>

<script setup>
import { ref, computed, inject, onBeforeUnmount, useAttrs, getCurrentInstance } from 'vue';
import { debounce as _debounce } from 'lodash';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  singleClick: Boolean,
});

const emit = defineEmits(['click', 'clicks']);
const attrs = useAttrs();
const instance = getCurrentInstance();

const context = inject('context', {});

const loading = ref(false);
const timesClicked = ref(0);

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
  const hasClicks = attrs.onClicks || instance?.vnode?.props?.onClicks;
  if (!hasClicks) return;
  loading.value = true;
  emit('clicks', timesClicked.value, acknowledgeChange);
  timesClicked.value = 0;
};

const debounceClicks = _debounce(clicks, debounceTime.value);

onBeforeUnmount(() => {
  debounceClicks.flush();
});

const click = () => {
  if (props.singleClick) {
    loading.value = true;
  } else {
    timesClicked.value += 1;
    debounceClicks();
  }
  emit('click', acknowledgeChange);
};
</script>
