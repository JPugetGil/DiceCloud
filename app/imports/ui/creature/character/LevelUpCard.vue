<template>
  <!--
    The character went up a level (A11): a card says so for LEVEL_UP_MS, with
    what changed. Never while the sheet loads, nor before the character's
    first computation is in, so not for a character just imported or
    duplicated either: their sheet opens with its level
  -->
  <div class="level-up-card">
    <transition name="level-up">
      <v-card
        v-if="shown"
        :key="shown.id"
        class="level-up-card__card"
        elevation="4"
        rounded="lg"
        data-id="level-up-card"
      >
        <v-card-item>
          <template #prepend>
            <v-icon
              color="primary"
              size="32"
            >
              mdi-arrow-up-bold-circle
            </v-icon>
          </template>
          <v-card-title class="level-up-card__title">
            {{ $t('levelUp.title', { level: shown.level }) }}
          </v-card-title>
        </v-card-item>
        <v-card-text
          v-if="shown.lines.length"
          class="pt-0"
        >
          <ul class="level-up-card__list">
            <li
              v-for="line in shown.lines"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
        </v-card-text>
      </v-card>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { levelSnapshot, levelChanges } from '/imports/ui/creature/character/levelUp';
import { READY_MS } from '/imports/ui/composables/useValueChange';
import { announce } from '/imports/ui/components/announcer';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

// How long the card shows, and how long the new level's changes take to come in
const LEVEL_UP_MS = 3000;
const SETTLE_MS = 1200;
const MAX_LINES = 5;

const { t } = useI18n();

const level = autorun(() => CreatureVariables.findOne(
  { _creatureId: props.creatureId }, { fields: { level: 1 } },
)?.level?.value).result;

const snapshot = autorun(() => levelSnapshot(CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
  type: { $in: ['attribute', 'feature', 'action', 'spell'] },
}, {
  fields: { type: 1, attributeType: 1, name: 1, value: 1, total: 1 },
}).fetch())).result;

// Not while the sheet loads, nor for another character's level, nor before
// the character was first computed: an import still computing gets its level
// late, which is no level up
const computedAt = autorun(() => Creatures.findOne(
  props.creatureId, { fields: { lastComputedAt: 1 } },
)?.lastComputedAt).result;
let ready = false;
let readyTimer;
function getReady() {
  ready = false;
  clearTimeout(readyTimer);
  if (!computedAt.value) return;
  readyTimer = setTimeout(() => { ready = true; }, READY_MS);
}
onMounted(getReady);
watch(() => props.creatureId, getReady);
watch(() => !!computedAt.value, (computed, wasComputed) => {
  if (computed && !wasComputed) getReady();
});

const shown = ref(undefined);
let pending;
let hideTimer;
let sequence = 0;

// The character before the level changed: kept while the changes come in
let before;
watch(snapshot, value => {
  if (!pending) before = value;
}, { immediate: true });


// A character without a class has no level variable: level 0
watch(level, (value, oldValue) => {
  if (!ready || !((value || 0) > (oldValue || 0)) || !before) return;
  clearTimeout(pending);
  const from = before;
  pending = setTimeout(() => {
    pending = undefined;
    show(value, levelChanges(from, snapshot.value));
    before = snapshot.value;
  }, SETTLE_MS);
});

function show(newLevel, { changed, gained }) {
  const lines = [
    ...changed.map(change => t('levelUp.changed', { name: change.name, from: change.from, to: change.to })),
    ...gained.map(name => t('levelUp.gained', { name })),
  ];
  const more = lines.length - MAX_LINES;
  const id = ++sequence;
  shown.value = {
    id,
    level: newLevel,
    lines: more > 0 ? [...lines.slice(0, MAX_LINES - 1), t('levelUp.more', { count: more + 1 }, more + 1)] : lines,
  };
  announce([t('levelUp.title', { level: newLevel }), ...lines].join('. '));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (shown.value?.id === id) shown.value = undefined;
  }, LEVEL_UP_MS);
}

onBeforeUnmount(() => {
  clearTimeout(readyTimer);
  clearTimeout(pending);
  clearTimeout(hideTimer);
});
</script>

<style scoped>
.level-up-card {
  position: fixed;
  top: calc(var(--v-layout-top) + 16px);
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  pointer-events: none;
  z-index: 1006;
}

.level-up-card__card {
  width: 100%;
  max-width: 360px;
  pointer-events: auto;
}

.level-up-card__list {
  margin: 0;
  padding-inline-start: 20px;
}

.level-up-enter-active {
  transition:
    opacity var(--motion-duration-long) var(--motion-easing-emphasized-decelerate),
    transform var(--motion-duration-long) var(--motion-easing-emphasized-decelerate);
}

.level-up-leave-active {
  transition: opacity var(--motion-duration-medium) var(--motion-easing-emphasized-accelerate);
}

.level-up-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.92);
}

.level-up-leave-to {
  opacity: 0;
}

/* Reduced animations: it fades in and out */
.reduce-motion .level-up-enter-active,
.reduce-motion .level-up-leave-active {
  transition: opacity var(--motion-duration-short) linear;
}

.reduce-motion .level-up-enter-from {
  transform: none;
}
</style>
