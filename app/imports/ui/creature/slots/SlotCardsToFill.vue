<template>
  <div class="w-100">
    <div
      v-if="progress?.total && progress.done < progress.total"
      class="d-flex align-center ga-3 px-2 pt-2 pb-1"
      data-id="build-progress"
    >
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
    <!-- A grid, not columns: cards read left to right in the library's order -->
    <v-fade-transition
      group
      tag="div"
      leave-absolute
      hide-on-leave
      class="slot-card-grid"
    >
      <div
        v-for="pointBuy in pointBuys"
        :key="pointBuy._id"
        style="transition: all 0.3s"
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
        style="transition: all 0.3s"
      >
        <slot-card :model="slot" />
      </div>
    </v-fade-transition>
  </div>
</template>

<script setup>
import { inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import SlotCard from '/imports/ui/creature/slots/SlotCard.vue';
import PointBuyCard from '/imports/ui/properties/components/pointBuy/PointBuyCard.vue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useBuildProgress from '/imports/ui/composables/useBuildProgress';

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

// The choices made so far, shown above the cards
const progress = useBuildProgress(() => context.creatureId);

const pointBuys = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendantsOfRoot(context.creatureId),
    type: 'pointBuy',
    ignored: { $ne: true },
    removed: {$ne: true},
    inactive: {$ne: true},
  }).fetch();
}).result;

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
</style>
