<template>
  <v-snackbar
    location="bottom left"

    variant="outlined"
    color="accent"
    v-bind="$attrs"
    :model-value="isShown"
    :timeout="timeout"
    @update:model-value="value => isShown = value"
  >
    <div class="d-flex flex-1-1 align-center">
      <template v-if="snackbar && snackbar.data">
        <div v-if="snackbar.data.text">
          {{ snackbar.data.text }}
        </div>
        <template v-else-if="snackbar.data.content">
          <log-content :model="snackbar.data.content" />
        </template>
        <v-spacer />
        <v-btn
          v-if="snackbar.data.callback"
          color="primary"
          variant="text"
          @click="closeSnackbar(); snackbar.data.callback()"
        >
          {{ $te('snackbar.' + snackbar.data.callbackName) ? $t('snackbar.' + snackbar.data.callbackName) : snackbar.data.callbackName }}
        </v-btn>
      </template>
    </div>
    <template #actions="{ attrs }">
      <v-btn
        variant="text"
        icon
        v-bind="attrs"
        @click="closeSnackbar"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
// Modified from https://gitlab.com/tozd/vue/snackbar-queue
import { ref, watch } from 'vue';
import { globalState } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import LogContent from '/imports/client/ui/log/LogContent.vue';

const props = defineProps({
  timeout: {
    type: Number,
    default: 15000,
  },
  pause: {
    type: Number,
    default: 300,
  },
});

// Replaces `vm.$wait` from @tozd/vue-observer-utils. That package drove the
// watcher through Vue 2.6's `vm._watchers` array, which Vue 2.7 removed when it
// moved to the new effect system, so installing it throws outright. It has no
// Vue 3 successor either, and this was its only call site.
//
// Same contract as the original: evaluate `condition` immediately and on every
// reactive change, and the first time it yields a truthy value, stop watching
// and hand that value to `effect`. Returns null if it fired straight away,
// otherwise a function that stops the wait.
function waitFor(condition, effect) {
  let stop = null;
  let fired = false;

  const onValue = function (value) {
    if (fired || !value) return;
    fired = true;
    if (stop) {
      stop();
      stop = null;
    }
    effect(value);
  };

  stop = watch(condition, onValue, { immediate: true });

  // An immediate hit runs before watch returns, so the teardown it asked for
  // has to happen out here, once we actually hold the stop handle.
  if (fired) {
    if (stop) {
      stop();
      stop = null;
    }
    return null;
  }

  return function unwait() {
    if (stop) {
      stop();
      stop = null;
    }
  };
}

const isShown = ref(false);
const snackbar = ref(null);

watch(isShown, (newValue) => {
  if (newValue === false && snackbar.value) {
    const snackbarIndex = globalState.queue.findIndex((element) => element.id === snackbar.value.id);
    if (snackbarIndex > -1) {
      globalState.queue.splice(snackbarIndex, 1);
    }
    snackbar.value = null;
  }
});

let handle = null;
let unwait = null;

function clearSnackbarState() {
  if (handle) {
    clearTimeout(handle);
    handle = null;
  }

  if (unwait) {
    unwait();
    unwait = null;
  }
}

function showNextSnackbar() {
  clearSnackbarState();

  // Wait for the first next snackbar to be available.
  unwait = waitFor(function () {
    // Snackbars are enqueued from oldest to newest and "find" searches array elements in
    // same order as well, so the first one which matches is also the oldest one.
    return globalState.queue.find((element) => element.shown === false);
  }, function (newSnackbar) {
    unwait = null;

    newSnackbar.shown = true;

    snackbar.value = newSnackbar;
    isShown.value = true;

    handle = setTimeout(() => {
      handle = null;

      showNextSnackbar();
    }, props.timeout + props.pause);
  });
}

function closeSnackbar() {
  clearSnackbarState();

  isShown.value = false;

  setTimeout(() => {
    showNextSnackbar();
  }, props.pause);
}

showNextSnackbar();
</script>
