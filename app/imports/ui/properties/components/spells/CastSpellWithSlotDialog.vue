<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('cards.castASpellTitle') }}
      </v-toolbar-title>
      <text-field
        :label="$t('common.name')"
        prepend-inner-icon="mdi-magnify"
        regular
        hide-details
        :model-value="searchValue"
        :error-messages="searchError"
        :debounce="200"
        @change="searchChanged"
      />
      <v-menu
        v-model="filterMenuOpen"
        location="left"
        :close-on-content-click="false"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            variant="text"
            icon
            :class="{'text-primary': filtersApplied}"
            v-bind="activatorProps"
          >
            <v-icon>mdi-filter</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item
            v-for="filter in booleanFilters"
            :key="filter.name"
            style="height: 52px;"
          >
            <v-checkbox
              v-model="filter.enabled"
              style="flex-grow: 0; margin-right: 8px;"
            />
            <v-switch
              v-model="filter.value"
              :disabled="!filter.enabled"
              :label="$t(filter.name)"
            />
          </v-list-item>
          <div class="d-flex flex-1-1">
            <v-btn
              variant="text"
              @click="clearBooleanFilters"
            >
              {{ $t('common.clear') }}
            </v-btn>
            <v-spacer />
            <v-btn
              variant="text"
              class="text-primary"
              @click="filterMenuOpen = false"
            >
              {{ $t('common.done') }}
            </v-btn>
          </div>
        </v-list>
      </v-menu>
    </template>
    <split-list-layout>
      <template #left>
        <div
          key="slot-title"
          class="text-title-large my-3"
        >
          {{ $t('castSpell.slot') }}
        </div>
        <v-list
          key="slot-list"
        >
          <v-list-item
            key="cantrip-dummy-slot"
            class="spell-slot-list-tile"
            :class="{ 'text-primary': selectedSlotId === 'no-slot' }"
            value="no-slot"
            :disabled="!canCastSpellWithSlot(selectedSpell, 'no-slot')"
            @click="selectedSlotId = 'no-slot'"
          >
            <v-list-item-title>
              {{ $t('castSpell.withoutSlot') }}
            </v-list-item-title>
          </v-list-item>
          <v-list-item
            key="ritual-dummy-slot"
            class="spell-slot-list-tile"
            :class="{ 'text-primary': selectedSlotId === 'ritual' }"
            value="ritual"
            :disabled="!canCastSpellWithSlot(selectedSpell, 'ritual')"
            @click="selectedSlotId = 'ritual'"
          >
            <v-list-item-title>
              {{ $t('castSpell.asRitual') }}
            </v-list-item-title>
          </v-list-item>
          <spell-slot-list-tile
            v-for="spellSlot in spellSlots"
            :key="spellSlot._id"
            :model="spellSlot"
            :class="{ 'text-primary': selectedSlotId === spellSlot._id }"
            :value="spellSlot._id"
            :disabled="!canCastSpellWithSlot(selectedSpell, spellSlot._id, spellSlot)"
            view-only
            @click="selectedSlotId = spellSlot._id"
          />
        </v-list>
      </template>
      <template #right>
        <div
          key="spell-title-right"
          class="text-title-large my-3"
        >
          {{ $t('castSpell.spell') }}
        </div>
        <v-list
          key="slot-list-right"
        >
          <template
            v-for="spell in computedSpells"
            :key="spell.isSubheader ? `${spell.level}-header` : spell._id"
          >
            <v-list-subheader
              v-if="spell.isSubheader"
              class="item"
            >
              {{ spell.level === 0 ? $t('spells.cantrips') : $t('spells.level', { level: spell.level }) }}
            </v-list-subheader>
            <spell-list-tile
              v-else
              hide-handle
              show-info-button
              :model="spell"
              :value="spell._id"
              :class="{ 'text-primary': selectedSpellId === spell._id }"
              :disabled="!canCastSpellWithSlot(spell, selectedSlotId, selectedSlot)"
              @click="selectedSpellId = spell._id"
              @show-info="spellDialog(spell._id)"
            />
          </template>
        </v-list>
      </template>
    </split-list-layout>
    <template #actions>
      <!-- Its targets (phase 2.1): preselected during a fight, chosen with "Target…" otherwise -->
      <v-menu
        v-if="spellTargeted"
        v-model="targetMenu"
        :close-on-content-click="false"
        location="top"
      >
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            variant="text"
            prepend-icon="mdi-target"
            class="text-none"
            data-id="cast-spell-targets"
          >
            {{ targetLabel }}
          </v-btn>
        </template>
        <v-card
          max-width="380"
          data-id="cast-spell-target-picker"
        >
          <v-card-text>
            <div
              v-if="!targetsReady"
              class="d-flex justify-center pa-2"
            >
              <v-progress-circular
                indeterminate
                :aria-label="$t('targetPicker.loading')"
              />
            </div>
            <target-picker
              v-else
              v-model="targetIds"
              :candidates="targetCandidateList"
              :actor-id="creatureId"
              :single="selectedSpell?.target !== 'multipleTargets'"
            />
          </v-card-text>
        </v-card>
      </v-menu>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-btn
        variant="text"
        :disabled="!canCast"
        class="mx-2 px-4"
        color="primary"
        data-id="cast-spell-dialog-btn"
        @click="cast"
      >
        {{ $t('cards.cast') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch, onMounted, provide, reactive } from 'vue';
import { useGoTo } from 'vuetify';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';

import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import SplitListLayout from '/imports/ui/properties/components/attributes/SplitListLayout.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import spellsWithSubheaders from '/imports/ui/properties/components/spells/spellsWithSubheaders';
import SpellSlotListTile from '/imports/ui/properties/components/attributes/SpellSlotListTile.vue';
import SpellListTile from '/imports/ui/properties/components/spells/SpellListTile.vue';
import { find } from 'lodash';
import doAction from '/imports/ui/creature/actions/doAction';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useTargetSelectionStore } from '/imports/ui/stores/targetSelection';
import TargetPicker from '/imports/ui/creature/actions/targets/TargetPicker.vue';
import {
  isFighting, partiesOf, targetCandidates, withPartyBoards,
} from '/imports/ui/creature/actions/targets/targetCandidates';
import { useI18n } from 'vue-i18n';

const dialogStackStore = useDialogStackStore();
const targetStore = useTargetSelectionStore();
const { t } = useI18n();

const slotFilter = {
  type: 'attribute',
  attributeType: 'spellSlot',
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
  'spellSlotLevel.value': { $gte: 1 },
};

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  spellId: {
    type: String,
    default: undefined,
  },
});

const goTo = useGoTo();

const selectedSlotId = ref(undefined);
const selectedSpellId = ref(props.spellId);
const selectedSlot = ref(undefined);
const selectedSpell = ref(undefined);
const searchValue = ref(undefined);
const searchError = ref(undefined);
const filterMenuOpen = ref(false);
const booleanFilters = ref({
  verbal: { name: 'spellComponents.verbal', enabled: false, value: true },
  somatic: { name: 'spellComponents.somatic', enabled: false, value: true },
  material: { name: 'spellComponents.material', enabled: false, value: true },
  concentration: { name: 'spellComponents.concentration', enabled: false, value: true },
  ritual: { name: 'spellComponents.ritual', enabled: false, value: true },
});

const editPermission = autorun(() => hasEditPermission(Creatures.findOne(props.creatureId), Meteor.user())).result;

provide('context', reactive({
  get editPermission() { return editPermission.value; }
}));

const spells = autorun(() => {
  let filter = {
    'root.id': props.creatureId,
    removed: { $ne: true },
    inactive: { $ne: true },
    $or: [
      { prepared: true },
      { alwaysPrepared: true },
    ],
  };

  // Apply the filters from the filter menu
  for (let key in booleanFilters.value) {
    if (booleanFilters.value[key].enabled) {
      let value = booleanFilters.value[key].value;
      if (key === 'material') {
        filter[key] = { $exists: booleanFilters.value[key].value };
      } else {
        filter[key] = value ? true : { $ne: true };
      }
    }
  }
  // Apply the search string to the name field
  if (searchValue.value) {
    filter.name = {
      $regex: searchValue.value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
      $options: 'i'
    };
  }
  return CreatureProperties.find(filter, {
    sort: { order: 1 }
  }).fetch();
}).result;

const spellSlots = autorun(() => {
  return CreatureProperties.find({
    'root.id': props.creatureId,
    ...slotFilter
  }, {
    sort: { 'spellSlotLevel.value': 1, order: 1 },
  }).fetch();
}).result;

const computedSpells = computed(() => {
  return spellsWithSubheaders(spells.value || []);
});

const canCast = computed(() => {
  if (!selectedSpell.value || !selectedSlotId.value) return false;
  return canCastSpellWithSlot(
    selectedSpell.value, selectedSlotId.value, selectedSlot.value
  );
});

const filtersApplied = computed(() => {
  for (let key in booleanFilters.value) {
    if (booleanFilters.value[key].enabled) {
      return true;
    }
  }
  return false;
});

watch(selectedSpellId, (spellId) => {
  selectedSpell.value = CreatureProperties.findOne(spellId);
}, { immediate: true });

watch(selectedSpell, (spell) => {
  if (!spell) return;
  if (selectedSlotId.value && canCastSpellWithSlot(
    spell, selectedSlotId.value, selectedSlot.value
  )) return;
  if (
    (spell.level === 0 || spell.castWithoutSpellSlots)
  ) {
    selectedSlotId.value = 'no-slot';
  } else {
    const newSlot = find(
      CreatureProperties.find({
        'root.id': props.creatureId,
        ...slotFilter
      }, {
        sort: { 'spellSlotLevel.value': 1, order: 1 },
      }).fetch(),
      slot => {
        return canCastSpellWithSlot(spell, slot._id, slot)
      }
    );
    if (newSlot) {
      selectedSlotId.value = newSlot._id;
    } else if (spell.ritual) {
      selectedSlotId.value = 'ritual';
    }
  }
}, { immediate: true });

watch(selectedSlotId, (slotId) => {
  selectedSlot.value = CreatureProperties.findOne(slotId);
}, { immediate: true });

watch(selectedSlot, (slot) => {
  if (!slot) return;
  if (!selectedSpell.value) return;
  if (selectedSpell.value.level > slot.spellSlotLevel?.value) {
    selectedSpellId.value = undefined;
  }
}, { immediate: true });

onMounted(() => {
  if (selectedSpellId.value) {
    goTo('.spell.v-list-item--active', { container: '.right' });
  }
});

// The spell's targets, as the target picker gives them (phase 2.1): during a
// fight its last targets, or the board's pick; none outside a fight, unless
// chosen. The parties' boards hold the creatures it may target: those
// fighting, which the sheet follows too, and all of them once the menu opens
const spellTargeted = computed(() => !!selectedSpell.value && selectedSpell.value.target !== 'self');
const targetMenu = ref(false);
const lookedAround = ref(false);
watch(targetMenu, open => { if (open) lookedAround.value = true; });
const fighting = autorun(() => isFighting(props.creatureId)).result;
const targetParties = autorun(() => {
  if (!props.creatureId) return [];
  Meteor.subscribe('characterParties', props.creatureId);
  return partiesOf(props.creatureId, { fighting: !lookedAround.value });
}).result;
const targetsReady = autorun(() => (targetParties.value || [])
  .map(party => Meteor.subscribe('partyBoard', party._id))
  .every(handle => handle.ready())).result;
const targetCandidateList = autorun(() => targetCandidates(props.creatureId, targetParties.value || [])).result;
const targetIds = ref([]);
watch([selectedSpellId, targetsReady], ([spellId, ready]) => {
  if (!ready) return;
  targetIds.value = fighting.value ? targetStore.preselection({
    propId: spellId,
    folderIds: (targetParties.value || []).map(party => party._id),
    candidateIds: (targetCandidateList.value || []).map(creature => creature._id),
    single: selectedSpell.value?.target !== 'multipleTargets',
  }) : [];
}, { immediate: true });
const targetLabel = computed(() => {
  const ids = targetIds.value;
  if (!ids.length) return fighting.value ? t('targetPicker.noTarget') : t('targetPicker.target');
  if (ids.length === 1) {
    return (targetCandidateList.value || []).find(creature => creature._id === ids[0])?.name
      || t('targetPicker.targetCount', { count: 1 }, 1);
  }
  return t('targetPicker.targetCount', { count: ids.length }, ids.length);
});

function clearBooleanFilters() {
  for (let key in booleanFilters.value) {
    booleanFilters.value[key].enabled = false;
  }
}

function spellDialog(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `spell-info-btn-${_id}`,
    data: { _id },
  });
}

function searchChanged(val, ack) {
  searchValue.value = val;
  setTimeout(ack, 200);
}

function canCastSpellWithSlot(spell, slotId, slot) {
  if (slot && !slot.value) return false;
  if (!spell) return true;
  if (!slotId) return true;
  if (
    spell.castWithoutSpellSlots &&
    spell.insufficientResources
  ) return false;
  if (spell.ritual && slotId === 'ritual') return true;
  if (!spell.level || spell.castWithoutSpellSlots) {
    // Cantrips and no-slot spells
    return slotId && slotId === 'no-slot'
  } else {
    // Levelled spells
    return slotId !== 'no-slot' && slot && spell && (
        spell.level <= slot.spellSlotLevel?.value
      );
  }
}

async function cast() {
  const spellId = selectedSpellId.value;
  let slotId = selectedSlotId.value;
  const ritual = slotId === 'ritual';
  const withoutSpellSlot = slotId === 'no-slot';
  if (ritual || withoutSpellSlot) slotId = undefined;
  
  const spell = CreatureProperties.findOne(spellId);
  if (!spell || spell.type !== 'spell') {
    return;
  }
  const spellTargetIds = spell.target === 'self' ? [] : [...targetIds.value];
  if (spell.target !== 'self') targetStore.remember(spellId, spellTargetIds);
  await withPartyBoards(spellTargetIds.length ? targetParties.value || [] : [], () => doAction({
    creatureId: props.creatureId,
    task: {
      subtaskFn: 'castSpell',
      prop: spell,
      targetIds: spellTargetIds,
      params: {
        slotId,
        ritual,
        withoutSpellSlot,
      },
    },
    elementId: 'cast-spell-dialog-btn',
    replaceDialog: true,
  })).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  });
}
</script>

<style lang="css" scoped>
.v-list {
  flex-basis: 200px;
}

.v-list.spells {
  flex-grow: 1;
}
</style>
