<template>
  <div class="buff-viewer">
    <v-row density="compact">
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
      />
      <!-- How long it lasts, and on whose turns the tracker counts it down (phase 3.5) -->
      <property-field
        v-if="durationText"
        :name="$t('viewers.duration')"
        :value="durationText"
        data-id="buff-viewer-duration"
      />
      <property-field
        v-if="clockText"
        :name="$t('viewers.durationCounted')"
        :value="clockText"
        data-id="buff-viewer-clock"
      />
      <property-field
        v-if="model.appliedBy?.name"
        :name="$t('viewers.appliedBy')"
        :value="model.appliedBy.name"
        data-id="buff-viewer-applied-by"
      />
    </v-row>
    <v-row density="compact">
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';
import {
  buffDurationRounds, buffRoundsLeft, durationEventOf,
} from '/imports/api/creature/creatureFolders/buffDurations';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();

const rounds = computed(() => buffDurationRounds(props.model));

// As written ("1 minute"), with the rounds it has left on a creature
const durationText = computed(() => {
  const written = props.model.duration?.calculation?.trim();
  if (rounds.value === undefined) return written;
  // Defined whenever the rounds are
  const left = /** @type {number} */ (buffRoundsLeft(props.model));
  const text = written || t('combat.rounds', { count: rounds.value }, rounds.value);
  return props.model.durationSpent ? `${text} · ${t('combat.roundsLeft', { count: left }, left)}` : text;
});

// At the start or the end of the turns, of the creature it is on or of the one that applied it
const clockText = computed(() => {
  if (rounds.value === undefined) return undefined;
  const end = durationEventOf(props.model) === 'turnEnd';
  if (props.model.durationAnchor === 'source') {
    return t(end ? 'viewers.countedAtSourceTurnEnd' : 'viewers.countedAtSourceTurnStart');
  }
  return t(end ? 'viewers.countedAtHolderTurnEnd' : 'viewers.countedAtHolderTurnStart');
});
</script>
