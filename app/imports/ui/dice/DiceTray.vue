<template>
  <div
    class="dice-tray"
    aria-hidden="true"
  >
    <div
      v-if="current"
      :key="current.id"
      class="dice-tray__throw"
      :class="{
        'dice-tray__throw--leaving': leaving,
        'dice-tray__throw--reduced': current.reduced,
      }"
      data-id="dice-tray"
    >
      <div
        v-if="!current.reduced"
        class="dice-tray__dice"
      >
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
        v-if="settled && (current.title || current.totals.length || current.crit || current.fumble)"
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
        <!-- Said in words as well as in colour: the d20 alone did not tell them apart -->
        <div
          v-if="current.crit"
          class="d-flex align-center justify-center ga-1 text-title-medium text-success"
          data-id="dice-tray-critical"
        >
          <v-icon size="small">
            mdi-star-four-points
          </v-icon>
          {{ $t('dice.critical') }}
        </div>
        <div
          v-if="current.fumble"
          class="d-flex align-center justify-center ga-1 text-title-medium text-error"
          data-id="dice-tray-fumble"
        >
          <v-icon size="small">
            mdi-skull-outline
          </v-icon>
          {{ $t('dice.fumble') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { rollsFromLog } from '/imports/ui/dice/logDice';
import { translateLogContent } from '/imports/ui/log/translateLog';
import dieShape from '/imports/ui/dice/dieShapes';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { setThrowPhase, endThrows, forgetThrows } from '/imports/ui/dice/diceTrayState';
import { announce } from '/imports/ui/components/announcer';
import { DURATION } from '/imports/ui/utility/motion';

/**
 * Dice thrown across the sheet for each roll written in the character's log,
 * whoever rolled: they tumble in, land on their result, and the result shows.
 * Neutral dice; a natural 20 or 1 on a d20 is coloured and named on the
 * result. The log and the snackbar wait for the dice to land
 * (diceTrayState), and screen readers hear the result. With reduced
 * animations, only the result shows, faded in.
 */
const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const MAX_DICE = 10;
// The dice's flight: a physical throw, the one animation longer than the
// motion tokens (DESIGN_SYSTEM.md, "Motion")
const FLIGHT_MS = 900;
const STAGGER_MS = 70;
const SHOWN_MS = 1800;

const { t } = useI18n();
const reducedMotion = useReducedMotion();

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
  // Whatever waited for the dice shows now
  endThrows();
}

const randomFace = size => Math.floor(Math.random() * (size || 6)) + 1;

// What a screen reader says: the title, the totals, a critical
function describe({ title, totals, dice, crit, fumble }) {
  const results = totals.length
    ? totals.map(total => total.label && totals.length > 1 ? `${total.label} ${total.value}` : `${total.value}`)
      .join(', ')
    : dice.map(die => die.value).join(', ');
  const parts = [title ? t('dice.announce', { title, results }) : t('dice.announceUntitled', { results })];
  if (crit) parts.push(t('dice.critical'));
  if (fumble) parts.push(t('dice.fumble'));
  return parts.join(' ');
}

function showResult(logId) {
  settled.value = true;
  setThrowPhase(logId, 'showing');
  announce(describe(current.value));
}

function leaveAfter(logId, shownFor, leaveMs) {
  timers.push(setTimeout(() => { leaving.value = true; }, shownFor));
  timers.push(setTimeout(() => {
    current.value = undefined;
    setThrowPhase(logId, 'done');
  }, shownFor + leaveMs));
}

async function throwDice(logId, log) {
  const { title, groups } = rollsFromLog(translateLogContent(log.content));
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
  const reduced = reducedMotion.value;
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
    crit: all.some(die => die.crit),
    fumble: all.some(die => die.fumble),
    reduced,
  };
  // Reduced: the result alone, faded in, nothing flies
  if (reduced) {
    showResult(logId);
    leaveAfter(logId, SHOWN_MS, DURATION.short);
    return;
  }
  setThrowPhase(logId, 'flying');
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
  timers.push(setTimeout(() => showResult(logId), landedAt));
  leaveAfter(logId, landedAt + SHOWN_MS, DURATION.long);
}

// The entries written from now on: the sheet has loaded those rolled before
let observer;
watch(() => props.creatureId, (creatureId) => {
  observer?.stop();
  clear();
  forgetThrows();
  current.value = undefined;
  if (!creatureId) return;
  let initializing = true;
  observer = CreatureLogs.find({ creatureId }, { fields: { content: 1 } }).observeChanges({
    added(id, fields) {
      if (!initializing) throwDice(id, fields);
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
  transition: opacity var(--motion-duration-long) var(--motion-easing-emphasized-accelerate),
    transform var(--motion-duration-long) var(--motion-easing-emphasized-accelerate);
}

.dice-tray__throw--leaving {
  opacity: 0;
  transform: translateY(16px);
}

/* Reduced animations: the result fades in and out, nothing moves */
.dice-tray__throw--reduced {
  transition: opacity var(--motion-duration-short) var(--motion-easing-standard);
}

.dice-tray__throw--reduced.dice-tray__throw--leaving {
  transform: none;
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

/*
 * Dice are neutral, Material's inverse surface (the tooltips' colour): it
 * stands out from the page in both themes, and leaves colour to the natural
 * 20 (success) and 1 (error), which primary dice made hard to tell apart
 */
.dice-tray__body {
  fill: rgb(var(--v-theme-surface-variant));
  stroke: rgba(0, 0, 0, 0.3);
  stroke-width: 2;
  stroke-linejoin: round;
  transition: fill var(--motion-duration-short) var(--motion-easing-standard);
}

.dice-tray__facet {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface-variant), 0.28);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.dice-tray__value {
  fill: rgb(var(--v-theme-on-surface-variant));
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dice-tray__die--landed svg {
  animation: dice-tray-land var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
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
  animation: dice-tray-land var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate),
    dice-tray-shake var(--motion-duration-long) var(--motion-duration-medium) var(--motion-easing-standard);
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
  animation: dice-tray-spark var(--motion-duration-long) var(--motion-easing-emphasized-decelerate) forwards;
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
  animation: dice-tray-result var(--motion-duration-short) var(--motion-easing-standard);
}

.dice-tray__total {
  display: inline-block;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  /* Grows and comes back as it lands: 1, 1.15, 1 */
  animation: dice-tray-total var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
}

.dice-tray__throw--reduced .dice-tray__total {
  animation: none;
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
  }
}

@keyframes dice-tray-total {
  50% {
    transform: scale(1.15);
  }
}
</style>
