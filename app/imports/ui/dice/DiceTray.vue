<template>
  <div
    class="dice-tray"
    aria-hidden="true"
  >
    <div
      v-if="current"
      :key="current.id"
      class="dice-tray__throw"
      :class="{ 'dice-tray__throw--leaving': leaving }"
      data-id="dice-tray"
    >
      <div class="dice-tray__dice">
        <div
          v-for="(die, index) in current.dice"
          :key="index"
          :ref="el => dieElements[index] = el"
          class="dice-tray__die"
          :class="{
            'dice-tray__die--landed': die.landed,
            'dice-tray__die--crit': die.landed && die.crit,
            'dice-tray__die--fumble': die.landed && die.fumble,
            'dice-tray__die--dropped': die.landed && die.dropped,
          }"
          :data-id="`dice-tray-die-${index}`"
        >
          <svg viewBox="0 0 100 100">
            <path
              class="dice-tray__body"
              :d="die.shape.body"
            />
            <path
              v-for="facet in die.shape.facets"
              :key="facet"
              class="dice-tray__facet"
              :d="facet"
            />
            <text
              class="dice-tray__value"
              x="50"
              :y="die.shape.textY"
              :font-size="die.shape.fontSize"
              text-anchor="middle"
              dominant-baseline="middle"
            >{{ die.shown }}</text>
          </svg>
          <span
            v-for="spark in die.landed && die.crit ? 8 : 0"
            :key="spark"
            class="dice-tray__spark"
            :style="{ '--angle': `${spark * 45}deg` }"
          />
        </div>
        <div
          v-if="current.hidden"
          class="dice-tray__more text-title-medium"
        >
          +{{ current.hidden }}
        </div>
      </div>
      <div
        v-if="settled && (current.title || current.totals.length)"
        class="dice-tray__result"
        data-id="dice-tray-result"
      >
        <div
          v-if="current.title"
          class="text-title-small text-medium-emphasis"
        >
          {{ current.title }}
        </div>
        <div class="d-flex justify-center flex-wrap ga-4">
          <div
            v-for="(total, index) in current.totals"
            :key="index"
            class="d-flex flex-column align-center"
          >
            <span
              v-if="total.label && current.totals.length > 1"
              class="text-label-medium text-medium-emphasis"
            >{{ total.label }}</span>
            <span class="dice-tray__total text-display-small">{{ total.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { rollsFromLog } from '/imports/ui/dice/logDice';
import dieShape from '/imports/ui/dice/dieShapes';

/**
 * Dice thrown across the sheet for each roll written in the character's log,
 * whoever rolled: they tumble in, land on their result, and the result shows.
 * The log still has the roll. Off with the account's preference, or when the
 * system asks for reduced motion.
 */
const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const MAX_DICE = 10;
const FLIGHT_MS = 900;
const STAGGER_MS = 70;
const SHOWN_MS = 1800;

const disabled = autorun(() => !!Meteor.user({ fields: { 'preferences.disableDiceAnimation': 1 } })
  ?.preferences?.disableDiceAnimation).result;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const current = ref(undefined);
const settled = ref(false);
const leaving = ref(false);
const dieElements = [];
let timers = [];
let animations = [];
let throwCount = 0;

function clear() {
  timers.forEach(timer => {
    clearTimeout(timer);
    clearInterval(timer);
  });
  timers = [];
  animations.forEach(animation => animation.cancel());
  animations = [];
}

const randomFace = size => Math.floor(Math.random() * (size || 6)) + 1;

async function throwDice(log) {
  if (disabled.value || reducedMotion?.matches) return;
  const { title, groups } = rollsFromLog(log.content);
  if (!groups.length) return;
  clear();
  const all = groups.flatMap(group => group.dice.map(die => ({
    ...die,
    shape: dieShape(die.size),
    crit: die.size === 20 && die.value === 20 && !die.dropped,
    fumble: die.size === 20 && die.value === 1 && !die.dropped,
    shown: randomFace(die.size),
    landed: false,
  })));
  dieElements.length = 0;
  settled.value = false;
  leaving.value = false;
  current.value = {
    id: ++throwCount,
    title,
    dice: reactive(all.slice(0, MAX_DICE)),
    hidden: Math.max(all.length - MAX_DICE, 0),
    totals: groups.filter(group => group.total !== undefined)
      .map(group => ({ label: group.label, value: group.total })),
  };
  await nextTick();
  const dice = current.value.dice;
  dice.forEach((die, index) => {
    const element = dieElements[index];
    if (!element) return;
    // From the right of the screen, high, spinning; two bounces to rest
    const dx = 240 + Math.random() * 160;
    const dy = -(120 + Math.random() * 100);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 360);
    const tilt = (Math.random() - 0.5) * 24;
    const animation = element.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.5)`, opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.35 - 30}px) rotate(${spin * 0.55}deg) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx * 0.18}px, 0) rotate(${spin * 0.2}deg)`, offset: 0.55 },
      { transform: `translate(${dx * 0.07}px, -22px) rotate(${spin * 0.07 + tilt}deg)`, offset: 0.72 },
      { transform: `translate(0, 0) rotate(${tilt / 2}deg)`, offset: 0.86 },
      { transform: 'translate(0, -5px) rotate(0deg)', offset: 0.93 },
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
    ], {
      duration: FLIGHT_MS,
      delay: index * STAGGER_MS,
      easing: 'cubic-bezier(0.25, 0.6, 0.35, 1)',
      fill: 'backwards',
    });
    animations.push(animation);
    // The faces flicker while it tumbles, then it shows its result
    const flicker = setInterval(() => { die.shown = randomFace(die.size); }, 65);
    timers.push(flicker);
    timers.push(setTimeout(() => {
      clearInterval(flicker);
      die.shown = die.value;
      die.landed = true;
    }, FLIGHT_MS * 0.86 + index * STAGGER_MS));
  });
  const landedAt = FLIGHT_MS + (dice.length - 1) * STAGGER_MS;
  timers.push(setTimeout(() => { settled.value = true; }, landedAt));
  timers.push(setTimeout(() => { leaving.value = true; }, landedAt + SHOWN_MS));
  timers.push(setTimeout(() => { current.value = undefined; }, landedAt + SHOWN_MS + 400));
}

// The entries written from now on: the sheet has loaded those rolled before
let observer;
watch(() => props.creatureId, (creatureId) => {
  observer?.stop();
  clear();
  current.value = undefined;
  if (!creatureId) return;
  let initializing = true;
  observer = CreatureLogs.find({ creatureId }, { fields: { content: 1 } }).observeChanges({
    added(id, fields) {
      if (!initializing) throwDice(fields);
    },
  });
  initializing = false;
}, { immediate: true });

onBeforeUnmount(() => {
  observer?.stop();
  clear();
});
</script>

<style scoped>
.dice-tray {
  position: fixed;
  inset: auto 0 96px 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 2500;
}

.dice-tray__throw {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.dice-tray__throw--leaving {
  opacity: 0;
  transform: translateY(16px);
}

.dice-tray__dice {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
  max-width: min(92vw, 620px);
}

.dice-tray__die {
  position: relative;
  width: 64px;
  height: 64px;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.45));
}

.dice-tray__die svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.dice-tray__body {
  fill: rgb(var(--v-theme-primary));
  stroke: rgba(0, 0, 0, 0.3);
  stroke-width: 2;
  stroke-linejoin: round;
  transition: fill 0.2s;
}

.dice-tray__facet {
  fill: none;
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.dice-tray__value {
  fill: rgb(var(--v-theme-on-primary));
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.25);
  stroke-width: 2;
}

.dice-tray__die--landed svg {
  animation: dice-tray-land 0.35s ease-out;
}

.dice-tray__die--crit .dice-tray__body {
  fill: rgb(var(--v-theme-success));
}

.dice-tray__die--crit .dice-tray__value {
  fill: rgb(var(--v-theme-on-success));
}

.dice-tray__die--crit {
  filter: drop-shadow(0 0 14px rgb(var(--v-theme-success)));
}

.dice-tray__die--fumble .dice-tray__body {
  fill: rgb(var(--v-theme-error));
}

.dice-tray__die--fumble .dice-tray__value {
  fill: rgb(var(--v-theme-on-error));
}

.dice-tray__die--fumble svg {
  animation: dice-tray-land 0.35s ease-out, dice-tray-shake 0.5s 0.3s ease-in-out;
}

.dice-tray__die--dropped {
  opacity: 0.45;
  filter: grayscale(0.8);
}

/* Sparks around a natural 20 */
.dice-tray__spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  margin: -3px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  animation: dice-tray-spark 0.7s ease-out forwards;
}

.dice-tray__more {
  min-width: 48px;
  text-align: center;
  color: rgb(var(--v-theme-on-surface));
}

.dice-tray__result {
  padding: 8px 20px;
  border-radius: 16px;
  background: rgba(var(--v-theme-surface), 0.94);
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  text-align: center;
  animation: dice-tray-result 0.3s ease-out;
}

.dice-tray__total {
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

@keyframes dice-tray-land {
  40% {
    transform: scale(1.22);
  }
}

@keyframes dice-tray-shake {
  20%, 60% {
    transform: translateX(-5px) rotate(-4deg);
  }
  40%, 80% {
    transform: translateX(5px) rotate(4deg);
  }
}

@keyframes dice-tray-spark {
  from {
    opacity: 1;
    transform: rotate(var(--angle)) translateY(0);
  }
  to {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(-56px);
  }
}

@keyframes dice-tray-result {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
}
</style>
