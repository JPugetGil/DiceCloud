<template>
  <div class="w-100">
    <!--
      The build in named steps, the library's (UX12): done, to do, or locked
      until an earlier one is. A step to do scrolls to the card waiting in it
    -->
    <div
      v-if="progress?.left"
      class="px-2 pt-2 pb-1"
      data-id="build-progress"
    >
      <div class="d-flex align-center ga-3">
        <v-progress-linear
          :model-value="progress.done / progress.total * 100"
          :aria-label="$t('build.progress', progress)"
          color="primary"
          height="8"
          rounded
          class="flex-1-1"
        />
        <span class="text-body-medium text-medium-emphasis text-no-wrap">
          {{ $t('build.progress', progress) }}
        </span>
      </div>
      <ol
        class="build-steps d-flex flex-wrap ga-2 mt-2 pa-0"
        :aria-label="$t('build.steps')"
        data-id="build-steps"
      >
        <li
          v-for="(step, index) in progress.steps"
          :key="step._id"
        >
          <v-chip
            size="small"
            :variant="step.done ? 'tonal' : step.locked ? 'text' : 'outlined'"
            :color="step.done ? 'success' : step === progress.next ? 'primary' : undefined"
            :prepend-icon="step.done ? 'mdi-check' : step.locked ? 'mdi-lock-outline' : undefined"
            :class="{ 'text-medium-emphasis': step.locked }"
            v-bind="step.waitingId ? { role: 'button', link: true } : {}"
            :data-id="`build-step-${step._id}`"
            v-on="step.waitingId ? { click: () => showCard(step.waitingId) } : {}"
          >
            <!-- Read as "2. Race, to do": a chip without a role may not take a label -->
            <span aria-hidden="true">
              <span
                v-if="!step.done && !step.locked"
                class="build-steps__number me-1"
              >{{ index + 1 }}</span>{{ step.name }}
            </span>
            <span class="d-sr-only">{{ stepLabel(step, index) }}</span>
          </v-chip>
        </li>
      </ol>
    </div>
    <!--
      A grid, not columns: cards read left to right in the library's order.
      No transition group, which measured every card at each server update:
      a card that arrives once the tab has loaded fades in by itself
    -->
    <div class="slot-card-grid">
      <div
        v-for="pointBuy in pointBuys"
        :key="pointBuy._id"
        :class="{ 'slot-card--new': isNew(pointBuy._id) }"
      >
        <point-buy-card
          :model="pointBuy"
          hover
          @ignore="ignoreProp(pointBuy._id)"
          @click="editPointBuy(pointBuy._id)"
        />
      </div>
      <div
        v-for="slot in slots"
        :key="slot._id"
        :class="{ 'slot-card--new': isNew(slot._id) }"
        :data-slot-card="slot._id"
      >
        <slot-card :model="slot" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, onMounted } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import SlotCard from '/imports/ui/creature/slots/SlotCard.vue';
import PointBuyCard from '/imports/ui/properties/components/pointBuy/PointBuyCard.vue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useBuildProgress from '/imports/ui/composables/useBuildProgress';
import { useI18n } from 'vue-i18n';

const dialogStackStore = useDialogStackStore();

const context = inject('context', {});

const slots = autorun(() => {
  const folderIds = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(context.creatureId),
    type: 'folder',
    hideStatsGroup: true,
    removed: { $ne: true },
    inactive: { $ne: true },
  }, { fields: { _id: 1 } }).map(folder => folder._id);

  const slots = CreatureProperties.find({
    ...getFilter.descendantsOfRoot(context.creatureId),
    'parentId': { $nin: folderIds },
    type: 'propertySlot',
    ignored: { $ne: true },
    $and: [
      {
        $or: [
          {'slotCondition.value': {$nin: [false, 0, '']}},
          {'slotCondition.value': {$exists: false}},
        ]
      },{
        $or: [
          { 'quantityExpected.value': {$in: [false, 0, '', undefined]} },
          { 'quantityExpected.value': {$exists: false} },
          {spaceLeft: {$gt: 0}},
        ]
      },
    ],
    removed: {$ne: true},
    inactive: {$ne: true},
  }, {
    sort: { left: 1 },
  }).fetch();
  // In the library's order, the slots that expect a choice before open-ended
  // ones (sources, extensions), which a build may leave as they are
  const expectsChoice = slot => slot.quantityExpected?.value > 0;
  return [...slots.filter(expectsChoice), ...slots.filter(slot => !expectsChoice(slot))];
}).result;

// The steps of the build, shown above the cards
const progress = useBuildProgress(() => context.creatureId);
const { t } = useI18n();

function stepLabel(step, index) {
  const name = `${index + 1}. ${step.name}`;
  if (step.done) return t('build.stepDone', { name });
  if (step.locked) return t('build.stepLocked', { name });
  return t('build.stepToDo', { name });
}

// A step's card: brought into view, and its button focused
function showCard(slotId) {
  const card = document.querySelector(`[data-slot-card="${slotId}"]`);
  if (!card) return;
  const reduced = document.documentElement.classList.contains('reduce-motion');
  card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  card.querySelector('button, [tabindex="0"], a')?.focus({ preventScroll: true });
}

const pointBuys = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(context.creatureId),
    type: 'pointBuy',
    ignored: { $ne: true },
    removed: {$ne: true},
    inactive: {$ne: true},
  }).fetch();
}).result;

// The cards shown when the tab loaded: only those that come later animate
const loadedIds = new Set();
let loaded = false;
onMounted(() => {
  [...(pointBuys.value || []), ...(slots.value || [])].forEach(doc => loadedIds.add(doc._id));
  loaded = true;
});
const isNew = id => loaded && !loadedIds.has(id);

async function ignoreProp(_id) {
  try {
    await updateCreatureProperty.callAsync({
      _id,
      path: ['ignored'],
      value: true
    });
  } catch (error) {
    console.error(error);
    snackbar({text: error.reason || error.message || error.toString()});
  }
}

function editPointBuy(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `point-buy-card-${_id}`,
    data: {
      _id,
      startInEditTab: true,
    },
  });
}
</script>

<style scoped>
.build-steps {
  list-style: none;
}

.build-steps__number {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.slot-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 8px;
  padding: 8px;
}

/* Cards in a row share its height, their buttons aligned at the bottom */
.slot-card-grid > div {
  display: flex;
}

.slot-card-grid > div > * {
  flex: 1 1 auto;
}

.slot-card--new {
  animation: slot-card-in var(--motion-duration-medium) var(--motion-easing-standard);
}

@keyframes slot-card-in {
  from {
    opacity: 0;
  }
}
</style>
