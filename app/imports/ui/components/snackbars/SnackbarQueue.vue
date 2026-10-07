<template>
  <v-snackbar
    v-bind="$attrs"
    v-model="isShown"
    location="bottom left"
    variant="outlined"
    color="accent"
    transition="snackbar-fade"
    :timeout="timeout"
  >
    <div class="d-flex flex-1-1 align-center">
      <template v-if="snackbar && snackbar.data">
        <div v-if="snackbar.data.text">
          {{ snackbar.data.text }}
        </div>
        <template v-else-if="snackbar.data.content">
          <!-- Dice the tray threw have rolled already: they do not roll in again -->
          <log-content
            :class="{ 'log-fresh': !snackbar.thrown }"
            :model="snackbar.data.content"
          />
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
        :aria-label="$t('common.close')"
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
import { useDisplay } from 'vuetify';
import { globalState } from '/imports/ui/components/snackbars/SnackbarQueue';
import LogContent from '/imports/ui/log/LogContent.vue';
import { throwPhase, wasThrown } from '/imports/ui/dice/diceTrayState';

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

// Evaluates `condition` immediately and on every reactive change, and the first
// time it yields a truthy value, stops watching and hands that value to
// `effect`. Returns null if it fired straight away, otherwise a function that
// stops the wait.
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
const { xs } = useDisplay();

// A log entry whose dice the tray is throwing waits for them to land; on a
// phone, where the tray covers the snackbar, for the tray to leave
function heldByDiceTray(element) {
  const phase = element.data?.logId && throwPhase(element.data.logId);
  return phase === 'flying' || (phase === 'showing' && xs.value);
}

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
    const next = globalState.queue.find((element) => element.shown === false);
    return next && !heldByDiceTray(next) ? next : undefined;
  }, function (newSnackbar) {
    unwait = null;

    newSnackbar.shown = true;
    newSnackbar.thrown = !!newSnackbar.data?.logId && wasThrown(newSnackbar.data.logId);

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

<style>
/* Snackbars fade in and out (stylesheets/motion.css) */
.snackbar-fade-enter-active,
.snackbar-fade-leave-active {
  transition: opacity var(--motion-duration-short) var(--motion-easing-standard);
}

.snackbar-fade-enter-from,
.snackbar-fade-leave-to {
  opacity: 0;
}
</style>
