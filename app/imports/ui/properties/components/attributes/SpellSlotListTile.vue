<template>
  <v-list-item
    :key="model._id"
    :data-id="`spell-slot-list-tile-${model._id}`"
    :disabled="disabled"
    class="spell-slot-list-tile"
    v-bind="$attrs"
    v-on="hasClickListener ? {click} : {}"
  >
    <v-list-item-title v-if="Number.isFinite(model.total)">
      <div
        v-if="model.total <= 0 || model.total > 5 || model.value > model.total || model.value < 0"
        class="d-flex flex-1-1 value"
        style="align-items: baseline;"
      >
        <div
          style="font-weight: 500; font-size: 24px"
          class="current-value"
        >
          {{ model.value }}
        </div>
        <div
          v-if="model.total"
          class="ml-2 max-value text-medium-emphasis"
        >
          /{{ model.total }}
        </div>
      </div>
      <!--
        A slot used empties at once and one restored fills, without waiting
        for the server; a spinner only if it is slow. Slots restored together,
        by a rest, fill one after the other (A7)
      -->
      <div
        v-else-if="canEdit"
        class="d-flex flex-1-1 align-center slot-bubbles"
      >
        <v-btn
          v-for="i in model.total"
          :key="i"
          variant="text"
          icon
          :aria-label="i <= shownValue
            ? $t('spells.useSlot', { name: model.name })
            : $t('spells.restoreSlot', { name: model.name })"
          :data-id="`spell-slot-bubble-${i}`"
          @click.stop.prevent="useOrRestore(i)"
        >
          <span
            class="slot-bubble"
            :class="{ 'slot-bubble--full': i <= shownValue }"
            :style="bubbleStyle(i)"
          />
        </v-btn>
        <v-progress-circular
          v-if="slow"
          indeterminate
          size="16"
          width="2"
          class="ml-1"
          :aria-label="$t('spells.slotsSaving')"
        />
      </div>
      <div
        v-else
        class="d-flex flex-1-1 align-center slot-bubbles view-only"
        :class="{'disabled-icon': disabled}"
      >
        <span
          v-for="i in model.total"
          :key="i"
          class="slot-bubble ma-1"
          :class="{ 'slot-bubble--full': i <= shownValue }"
          :style="bubbleStyle(i)"
        />
      </div>
    </v-list-item-title>
    <v-list-item-title v-else>
      <code>
        {{ model.total }}
      </code>
    </v-list-item-title>
    <v-list-item-subtitle>
      {{ model.name }}
    </v-list-item-subtitle>
  </v-list-item>
</template>

<script setup>
import { computed, inject, ref, watch, onBeforeUnmount } from 'vue';
import { SLOW_MS } from '/imports/ui/utility/motion';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import doAction from '/imports/ui/creature/actions/doAction';
import getPropertyTitle from '/imports/ui/properties/shared/getPropertyTitle';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  viewOnly: Boolean,
  disabled: Boolean,
  // The parent's @click listener, declared so that the tile knows whether it is
  // clickable: Vue keeps a declared event's listener out of $attrs.
  // `emit('click')` still calls it.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const context = inject('context', {});

// Slots restored together fill this far apart
const CASCADE_MS = 40;

const hasClickListener = computed(() => {
  return !!props.onClick;
});

const canEdit = computed(() => {
  return context.editPermission && !props.viewOnly;
});

function click(e) {
  emit('click', e);
}

// The value the slots show: the one asked for until the server has it
const target = ref(undefined);
const shownValue = computed(() => target.value ?? props.model.value);
let inFlight = 0;

// Slots filled together fill one after the other: where the filling started
const fillFrom = ref(props.model.value);
watch(shownValue, (value, oldValue) => {
  fillFrom.value = value > oldValue ? oldValue : value;
});
const bubbleStyle = i => i > fillFrom.value
  ? { '--fill-delay': `${(i - fillFrom.value - 1) * CASCADE_MS}ms` }
  : undefined;

// Waiting for the server: a spinner once the wait is long
const slow = ref(false);
let slowTimer;
onBeforeUnmount(() => clearTimeout(slowTimer));

// A full slot uses one, an empty one restores one
async function useOrRestore(i) {
  const base = shownValue.value;
  const using = i <= base;
  target.value = Math.min(props.model.total, Math.max(0, base + (using ? -1 : 1)));
  inFlight += 1;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => { slow.value = true; }, SLOW_MS);
  try {
    await damageProperty({ type: 'increment', value: using ? 1 : -1 });
    if (inFlight === 1) await valueReached(target.value);
  } catch (error) {
    target.value = undefined;
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  } finally {
    inFlight -= 1;
    if (!inFlight) {
      target.value = undefined;
      clearTimeout(slowTimer);
      slow.value = false;
    }
  }
}

// The method answers before its changes reach the client: wait for them
function valueReached(value, timeout = 3000) {
  return new Promise(resolve => {
    if (props.model.value === value) return resolve();
    let stop;
    const timer = setTimeout(done, timeout);
    stop = watch(() => props.model.value === value, reached => { if (reached) done(); });
    function done() {
      clearTimeout(timer);
      stop?.();
      resolve();
    }
  });
}

function damageProperty({ type, value }) {
  const model = props.model;
  return doAction({
    creatureId: model.root.id,
    elementId: `spell-slot-list-tile-${model._id}`,
    task: {
      subtaskFn: 'damageProp',
      targetIds: [model.root.id],
      params: {
        title: getPropertyTitle(model),
        operation: type,
        value,
        targetProp: model,
      },
    },
  });
}
</script>

<style lang="css" scoped>
.spell-slot-list-tile {
  background: inherit;
}

.v-list-item-action {
  width: 112px;
  flex-shrink: 0;
}

.disabled-icon {
  opacity: 0.3;
}

/* A slot: a ring, full with a disc that grows in, or shrinks away */
.slot-bubble {
  position: relative;
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid currentColor;
  border-radius: 50%;
}

.slot-bubble::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: currentColor;
  transform: scale(0);
  transition: transform var(--motion-duration-short) var(--motion-easing-emphasized-accelerate);
}

.slot-bubble--full::after {
  transform: scale(1);
  transition: transform var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
  transition-delay: var(--fill-delay, 0ms);
}

/* Reduced animations: the disc fades in and out, all at once */
.reduce-motion .slot-bubble::after {
  transform: none;
  opacity: 0;
  transition: opacity var(--motion-duration-short) linear;
}

.reduce-motion .slot-bubble--full::after {
  opacity: 1;
}

</style>
